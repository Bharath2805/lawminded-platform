import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ChatMessageRole, Prisma } from '@prisma/client';
import type { AssistantStreamEvent } from 'openai/resources/beta/assistants';
import type { Stream } from 'openai/streaming';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { ChatStreamRequestDto } from '../dto/chat-stream-request.dto';
import { UpdateChatConversationDto } from '../dto/update-chat-conversation.dto';
import { ComplianceToolService } from './compliance-tool.service';
import { OpenAIAssistantService, ToolOutput } from './openai-assistant.service';

export interface UploadedChatFile {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size: number;
}

type StreamPayload =
  | { type: 'meta'; thread_id: string; conversation_id: string }
  | { type: 'status'; content: string }
  | { type: 'text'; content: string }
  | { type: 'replace'; content: string }
  | { type: 'error'; content: string };

const DEFAULT_CONVERSATION_TITLE = 'New conversation';
const MAX_CONVERSATION_TITLE_LENGTH = 80;
const MAX_CONVERSATION_MESSAGES = 500;
const TRIAL_PROMPT_LIMIT = 1;
const MIN_ANONYMOUS_ID_LENGTH = 8;
const MAX_ANONYMOUS_ID_LENGTH = 120;
const ANONYMOUS_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const RESPONSE_DETAILS_FOLLOWUP = 'Reply "details" for a full legal breakdown.';
const FIRST_RESPONSE_MAX_WORDS = 220;
const GENERIC_PREAMBLE_PATTERN =
  /^(based on|i have reviewed|from the provided information)/i;
const GREETING_ONLY_PATTERN =
  /^(?:hi|hello|hey|thanks|thank you|good (?:morning|afternoon|evening)|how are you)[\s!,.?]*$/i;
const SECTION_HEADINGS = [
  'Quick answer',
  'Risk level',
  'Why this risk level',
  'Applicable AI Act articles',
  'Next actions',
  'Confidence',
  'Missing information',
] as const;

type ListConversationOptions = {
  includeArchived?: boolean;
  search?: string;
};

type TrialIdentityInput = {
  userId?: string | null;
  anonymousId?: string | null;
  hasPremiumAccess: boolean;
};

type TrialIdentity = {
  userId: string | null;
  anonymousId: string | null;
  hasPremiumAccess: boolean;
};

type TrialStateMessage = {
  id: string;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
};

@Injectable()
export class ChatService implements OnModuleInit {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openaiService: OpenAIAssistantService,
    private readonly complianceTools: ComplianceToolService,
  ) {}

  public onModuleInit(): void {
    void this.openaiService.warmupAssistant().catch((error) => {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Assistant warmup failed: ${message}`);
    });
  }

  public async uploadFile(file: UploadedChatFile) {
    const uploaded = await this.openaiService.uploadFile(
      file.originalname,
      file.buffer,
    );
    return {
      file_id: uploaded.id,
      filename: file.originalname,
      status: 'uploaded',
    };
  }

  public async claimAnonymousConversationsForUser(
    userId: string,
    anonymousIdRaw: string | null | undefined,
  ) {
    const anonymousId = this.normalizeAnonymousId(anonymousIdRaw);

    if (!anonymousId) {
      return;
    }

    await this.prisma.chatConversation.updateMany({
      where: {
        userId: null,
        anonymousId,
        deletedAt: null,
      },
      data: {
        userId,
        anonymousId: null,
      },
    });
  }

  public async getTrialState(identityInput: TrialIdentityInput) {
    const identity = await this.normalizeTrialIdentity(identityInput);

    if (!identity.userId && !identity.anonymousId) {
      return {
        trial: {
          isAuthenticated: false,
          conversationId: null,
          promptLimit: TRIAL_PROMPT_LIMIT,
          usedPrompts: 0,
          remainingPrompts: TRIAL_PROMPT_LIMIT,
          canSend: true,
          isPremiumUser: false,
          messages: [] as TrialStateMessage[],
        },
      };
    }

    const conversation = await this.findExistingTrialConversation(identity);
    const usedPrompts = identity.hasPremiumAccess
      ? 0
      : await this.countUsedTrialPrompts(identity);
    const remainingPrompts = identity.hasPremiumAccess
      ? null
      : Math.max(0, TRIAL_PROMPT_LIMIT - usedPrompts);

    const messages = conversation
      ? await this.prisma.chatMessage.findMany({
          where: {
            conversationId: conversation.id,
          },
          orderBy: {
            createdAt: 'asc',
          },
          take: MAX_CONVERSATION_MESSAGES,
        })
      : [];

    return {
      trial: {
        isAuthenticated: Boolean(identity.userId),
        conversationId: conversation?.id ?? null,
        promptLimit: TRIAL_PROMPT_LIMIT,
        usedPrompts,
        remainingPrompts,
        canSend: identity.hasPremiumAccess || usedPrompts < TRIAL_PROMPT_LIMIT,
        isPremiumUser: identity.hasPremiumAccess,
        messages: messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt.toISOString(),
        })),
      },
    };
  }

  public async *streamTrial(
    identityInput: TrialIdentityInput,
    request: ChatStreamRequestDto,
  ): AsyncGenerator<StreamPayload> {
    const identity = await this.normalizeTrialIdentity(identityInput);

    if (!identity.userId && !identity.anonymousId) {
      throw new BadRequestException(
        'Anonymous ID is required when not authenticated',
      );
    }

    if (!identity.hasPremiumAccess) {
      const usedPrompts = await this.countUsedTrialPrompts(identity);

      if (usedPrompts >= TRIAL_PROMPT_LIMIT) {
        throw new ForbiddenException(
          'Trial limit reached. Upgrade to continue with the assistant.',
        );
      }
    }

    const conversation = await this.findOrCreateTrialConversation(identity);
    yield* this.streamConversation(conversation.id, request);
  }

  public async listConversationsForUser(
    userId: string,
    options: ListConversationOptions = {},
  ) {
    const includeArchived = options.includeArchived === true;
    const search = options.search?.trim();

    const where: Prisma.ChatConversationWhereInput = {
      userId,
      deletedAt: null,
      ...(includeArchived ? {} : { archivedAt: null }),
      ...(search
        ? {
            OR: [
              {
                title: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
              {
                messages: {
                  some: {
                    content: {
                      contains: search,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.chatConversation.findMany({
      where,
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: {
          select: {
            messages: true,
          },
        },
      },
    });

    const sortedRows = [...rows].sort((a, b) => {
      const aPinned = a.pinnedAt?.getTime() ?? 0;
      const bPinned = b.pinnedAt?.getTime() ?? 0;

      if (Boolean(a.pinnedAt) !== Boolean(b.pinnedAt)) {
        return a.pinnedAt ? -1 : 1;
      }

      if (aPinned !== bPinned) {
        return bPinned - aPinned;
      }

      return b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
    });

    return {
      conversations: sortedRows.map((row) => ({
        id: row.id,
        title: row.title,
        threadId: row.threadId,
        pinnedAt: row.pinnedAt?.toISOString() ?? null,
        archivedAt: row.archivedAt?.toISOString() ?? null,
        isPinned: row.pinnedAt !== null,
        isArchived: row.archivedAt !== null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        lastMessageAt: row.lastMessageAt.toISOString(),
        messageCount: row._count.messages,
        lastMessagePreview: row.messages[0]?.content?.slice(0, 220) ?? null,
      })),
    };
  }

  public async createConversationForUser(userId: string, title?: string) {
    const conversation = await this.prisma.chatConversation.create({
      data: {
        userId,
        title: this.normalizeConversationTitle(title),
      },
    });

    return {
      conversation: {
        id: conversation.id,
        title: conversation.title,
        threadId: conversation.threadId,
        pinnedAt: conversation.pinnedAt?.toISOString() ?? null,
        archivedAt: conversation.archivedAt?.toISOString() ?? null,
        isPinned: conversation.pinnedAt !== null,
        isArchived: conversation.archivedAt !== null,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
        lastMessageAt: conversation.lastMessageAt.toISOString(),
      },
    };
  }

  public async getConversationWithMessagesForUser(
    userId: string,
    conversationId: string,
  ) {
    const conversation = await this.getConversationOrThrow(
      userId,
      conversationId,
    );

    const messages = await this.prisma.chatMessage.findMany({
      where: {
        conversationId: conversation.id,
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: MAX_CONVERSATION_MESSAGES,
    });

    return {
      conversation: {
        id: conversation.id,
        title: conversation.title,
        threadId: conversation.threadId,
        pinnedAt: conversation.pinnedAt?.toISOString() ?? null,
        archivedAt: conversation.archivedAt?.toISOString() ?? null,
        isPinned: conversation.pinnedAt !== null,
        isArchived: conversation.archivedAt !== null,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
        lastMessageAt: conversation.lastMessageAt.toISOString(),
        messages: messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt.toISOString(),
        })),
      },
    };
  }

  public async deleteConversationForUser(
    userId: string,
    conversationId: string,
  ) {
    await this.getConversationOrThrow(userId, conversationId);

    await this.prisma.chatConversation.update({
      where: {
        id: conversationId,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return {
      success: true,
    };
  }

  public async updateConversationForUser(
    userId: string,
    conversationId: string,
    input: UpdateChatConversationDto,
  ) {
    const existing = await this.getConversationOrThrow(userId, conversationId);
    const data: Prisma.ChatConversationUpdateInput = {};

    if (typeof input.title === 'string') {
      data.title = this.normalizeConversationTitle(input.title);
    }

    if (typeof input.isPinned === 'boolean') {
      data.pinnedAt = input.isPinned ? new Date() : null;
    }

    if (typeof input.isArchived === 'boolean') {
      data.archivedAt = input.isArchived ? new Date() : null;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'Provide at least one field to update (title, isPinned, isArchived)',
      );
    }

    const updated = await this.prisma.chatConversation.update({
      where: {
        id: existing.id,
      },
      data,
    });

    return {
      conversation: {
        id: updated.id,
        title: updated.title,
        threadId: updated.threadId,
        pinnedAt: updated.pinnedAt?.toISOString() ?? null,
        archivedAt: updated.archivedAt?.toISOString() ?? null,
        isPinned: updated.pinnedAt !== null,
        isArchived: updated.archivedAt !== null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        lastMessageAt: updated.lastMessageAt.toISOString(),
      },
    };
  }

  public async ensureConversationForStream(
    userId: string,
    conversationId?: string,
  ) {
    if (conversationId) {
      const existing = await this.prisma.chatConversation.findFirst({
        where: {
          id: conversationId,
          userId,
          deletedAt: null,
        },
      });

      if (existing) {
        return existing;
      }
    }

    const created = await this.prisma.chatConversation.create({
      data: {
        userId,
        title: DEFAULT_CONVERSATION_TITLE,
      },
    });

    return created;
  }

  public async *stream(
    userId: string,
    conversationId: string,
    request: ChatStreamRequestDto,
  ): AsyncGenerator<StreamPayload> {
    await this.getConversationOrThrow(userId, conversationId);
    yield* this.streamConversation(conversationId, request);
  }

  private async *streamConversation(
    conversationId: string,
    request: ChatStreamRequestDto,
  ): AsyncGenerator<StreamPayload> {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: {
        id: conversationId,
        deletedAt: null,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const message = this.normalizeMessage(request.message);
    const threadId =
      conversation.threadId ?? (await this.openaiService.createThread()).id;

    const existingUserMessageCount = await this.prisma.chatMessage.count({
      where: {
        conversationId: conversation.id,
        role: ChatMessageRole.USER,
      },
    });

    const shouldSetTitle =
      existingUserMessageCount === 0 ||
      conversation.title.trim() === DEFAULT_CONVERSATION_TITLE;
    const firstUserMessage = existingUserMessageCount === 0;
    const filesAttached =
      Array.isArray(request.uploaded_file_ids) &&
      request.uploaded_file_ids.length > 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.chatConversation.update({
        where: {
          id: conversation.id,
        },
        data: {
          threadId,
          title: shouldSetTitle
            ? this.buildConversationTitle(message)
            : conversation.title,
          lastMessageAt: new Date(),
          archivedAt: null,
          deletedAt: null,
        },
      });

      await tx.chatMessage.create({
        data: {
          conversationId: conversation.id,
          role: ChatMessageRole.USER,
          content: message,
        },
      });
    });

    yield {
      type: 'meta',
      thread_id: threadId,
      conversation_id: conversation.id,
    };

    try {
      await this.openaiService.createUserMessage(
        threadId,
        this.buildAssistantInputMessage(message, {
          firstUserMessage,
          filesAttached,
        }),
        request.uploaded_file_ids,
      );

      const stream = await this.openaiService.createRunStream(threadId);
      let assistantContent = '';
      let firstError: string | null = null;

      for await (const payload of this.consumeAssistantStream(
        stream,
        threadId,
      )) {
        if (payload.type === 'text') {
          assistantContent += payload.content;
        }

        if (payload.type === 'error' && !firstError) {
          firstError = payload.content;
        }

        yield payload;
      }

      const normalizedAssistant = assistantContent.trim();
      const finalizedAssistant =
        normalizedAssistant.length > 0
          ? this.normalizeAssistantReply(normalizedAssistant, {
              userMessage: message,
              firstUserMessage,
            })
          : '';

      if (finalizedAssistant.length > 0) {
        if (finalizedAssistant !== normalizedAssistant) {
          yield { type: 'replace', content: finalizedAssistant };
        }

        await this.prisma.$transaction(async (tx) => {
          await tx.chatMessage.create({
            data: {
              conversationId: conversation.id,
              role: ChatMessageRole.ASSISTANT,
              content: finalizedAssistant,
            },
          });

          await tx.chatConversation.update({
            where: {
              id: conversation.id,
            },
            data: {
              lastMessageAt: new Date(),
            },
          });
        });
      } else if (firstError) {
        await this.persistErrorMessage(conversation.id, firstError);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Streaming failed';
      await this.persistErrorMessage(conversation.id, message);
      yield { type: 'error', content: message };
    }
  }

  private async *consumeAssistantStream(
    stream: Stream<AssistantStreamEvent>,
    threadId: string,
  ): AsyncGenerator<StreamPayload> {
    for await (const event of stream) {
      if (event.event === 'thread.message.delta') {
        const textParts = this.extractTextParts(event);

        for (const textPart of textParts) {
          yield { type: 'text', content: textPart };
        }
      }

      if (event.event === 'thread.run.requires_action') {
        yield { type: 'status', content: 'Processing tool calls...' };

        const toolOutputs = await this.executeToolCalls(event);

        if (toolOutputs.length > 0) {
          const toolStream = await this.openaiService.submitToolOutputsStream(
            event.data.id,
            threadId,
            toolOutputs,
          );

          yield* this.consumeAssistantStream(toolStream, threadId);
        }
      }

      if (event.event === 'thread.run.failed') {
        const message = event.data.last_error?.message ?? 'Run failed';
        yield { type: 'error', content: message };
      }

      if (event.event === 'error') {
        yield { type: 'error', content: event.data.message };
      }
    }
  }

  private extractTextParts(
    event: AssistantStreamEvent.ThreadMessageDelta,
  ): string[] {
    const content = event.data.delta.content;

    if (!content) {
      return [];
    }

    return content
      .map((part) => {
        if (part.type !== 'text') {
          return null;
        }

        return part.text?.value ?? null;
      })
      .filter((value): value is string => Boolean(value));
  }

  private async executeToolCalls(
    event: AssistantStreamEvent.ThreadRunRequiresAction,
  ): Promise<ToolOutput[]> {
    const requiredAction = event.data.required_action;

    if (!requiredAction || requiredAction.type !== 'submit_tool_outputs') {
      return [];
    }

    const outputs: ToolOutput[] = [];

    for (const toolCall of requiredAction.submit_tool_outputs.tool_calls) {
      if (toolCall.type !== 'function') {
        continue;
      }

      const functionName = toolCall.function.name;
      const args = this.safeParseJson(toolCall.function.arguments);

      this.logger.log(`Executing tool ${functionName}`);

      if (functionName === 'search_web') {
        const result = await this.complianceTools.searchWebRestricted(
          this.getStringArg(args.query),
        );

        outputs.push({
          tool_call_id: toolCall.id,
          output: JSON.stringify(result),
        });

        continue;
      }

      if (functionName === 'classify_risk') {
        const result = this.complianceTools.classifyRisk(
          this.getStringArg(args.system_description),
          Array.isArray(args.features)
            ? (args.features as string[])
            : undefined,
        );

        outputs.push({
          tool_call_id: toolCall.id,
          output: JSON.stringify(result),
        });

        continue;
      }

      outputs.push({
        tool_call_id: toolCall.id,
        output: 'Unknown tool',
      });
    }

    return outputs;
  }

  private safeParseJson(value: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (typeof parsed === 'object' && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }

  private getStringArg(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    return '';
  }

  private async normalizeTrialIdentity(
    input: TrialIdentityInput,
  ): Promise<TrialIdentity> {
    const userId = input.userId?.trim() ?? null;
    const anonymousId = this.normalizeAnonymousId(input.anonymousId);

    if (userId && anonymousId) {
      await this.claimAnonymousConversationsForUser(userId, anonymousId);
    }

    return {
      userId,
      anonymousId: userId ? null : anonymousId,
      hasPremiumAccess: input.hasPremiumAccess,
    };
  }

  private async findExistingTrialConversation(identity: TrialIdentity) {
    if (identity.userId) {
      return this.prisma.chatConversation.findFirst({
        where: {
          userId: identity.userId,
          isTrial: true,
          deletedAt: null,
        },
        orderBy: [{ updatedAt: 'desc' }],
      });
    }

    if (identity.anonymousId) {
      return this.prisma.chatConversation.findFirst({
        where: {
          anonymousId: identity.anonymousId,
          isTrial: true,
          deletedAt: null,
        },
        orderBy: [{ updatedAt: 'desc' }],
      });
    }

    return null;
  }

  private async findOrCreateTrialConversation(identity: TrialIdentity) {
    const existing = await this.findExistingTrialConversation(identity);

    if (existing) {
      return existing;
    }

    return this.prisma.chatConversation.create({
      data: {
        userId: identity.userId,
        anonymousId: identity.anonymousId,
        isTrial: true,
        title: DEFAULT_CONVERSATION_TITLE,
      },
    });
  }

  private async countUsedTrialPrompts(
    identity: TrialIdentity,
  ): Promise<number> {
    if (identity.userId) {
      return this.prisma.chatMessage.count({
        where: {
          role: ChatMessageRole.USER,
          conversation: {
            userId: identity.userId,
            isTrial: true,
            deletedAt: null,
          },
        },
      });
    }

    if (identity.anonymousId) {
      return this.prisma.chatMessage.count({
        where: {
          role: ChatMessageRole.USER,
          conversation: {
            anonymousId: identity.anonymousId,
            isTrial: true,
            deletedAt: null,
          },
        },
      });
    }

    return 0;
  }

  private normalizeAnonymousId(
    value: string | null | undefined,
  ): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();

    if (
      normalized.length < MIN_ANONYMOUS_ID_LENGTH ||
      normalized.length > MAX_ANONYMOUS_ID_LENGTH
    ) {
      return null;
    }

    if (!ANONYMOUS_ID_PATTERN.test(normalized)) {
      return null;
    }

    return normalized;
  }

  private normalizeConversationTitle(value?: string): string {
    if (typeof value !== 'string') {
      return DEFAULT_CONVERSATION_TITLE;
    }

    const normalized = value.trim().replace(/\s+/g, ' ');

    if (!normalized) {
      return DEFAULT_CONVERSATION_TITLE;
    }

    return normalized.slice(0, MAX_CONVERSATION_TITLE_LENGTH);
  }

  private buildConversationTitle(message: string): string {
    const firstLine = message.split('\n')[0]?.trim() ?? '';
    return this.normalizeConversationTitle(
      firstLine || DEFAULT_CONVERSATION_TITLE,
    );
  }

  private normalizeMessage(value: string): string {
    const normalized = value.trim();

    if (!normalized) {
      throw new BadRequestException('Message is required');
    }

    return normalized;
  }

  private normalizeAssistantReply(
    rawResponse: string,
    context: {
      userMessage: string;
      firstUserMessage: boolean;
    },
  ): string {
    const trimmed = rawResponse.trim();

    if (!trimmed) {
      return trimmed;
    }

    if (this.isGreetingOnlyInput(context.userMessage)) {
      return trimmed;
    }

    const normalizedRaw = this.applyLightweightNormalization(trimmed);
    const constrainedRaw = this.applyFirstMessageConstraints(
      normalizedRaw,
      context.firstUserMessage,
    );

    if (this.isResponseCompliant(constrainedRaw, context.firstUserMessage)) {
      return constrainedRaw;
    }

    const constrainedRebuilt = this.applyFirstMessageConstraints(
      this.buildStructuredAssistantReply(normalizedRaw),
      context.firstUserMessage,
    );

    if (
      this.isResponseCompliant(constrainedRebuilt, context.firstUserMessage)
    ) {
      return constrainedRebuilt;
    }

    if (this.isResponseCompliant(constrainedRaw, context.firstUserMessage)) {
      return constrainedRaw;
    }

    return constrainedRaw || constrainedRebuilt || trimmed;
  }

  private isGreetingOnlyInput(value: string): boolean {
    return GREETING_ONLY_PATTERN.test(value.trim());
  }

  private applyLightweightNormalization(value: string): string {
    const stripped = this.stripGenericPreamble(value).trim();

    if (!stripped) {
      return stripped;
    }

    const deMarkdowned = stripped
      .replace(/^\s*#{1,6}\s+/gm, '')
      .replace(
        /\*\*(Quick answer|Risk level|Why this risk level|Applicable AI Act articles|Next actions|Confidence|Missing information)\*\*/gi,
        '$1',
      );
    const riskLevel = this.extractRiskLevel(deMarkdowned);
    const confidence = this.extractConfidence(deMarkdowned);
    const withoutRisk = deMarkdowned
      .replace(/(?:^|\n)\s*(?:#+\s*)?Risk level\s*:\s*[^\n]*(?=\n|$)/gi, '\n')
      .trim();
    const withoutConfidence = withoutRisk
      .replace(
        /(?:^|\n)\s*(?:#+\s*)?Confidence\s*:\s*(High|Medium|Low)\b[^\n]*(?=\n|$)/gi,
        '\n',
      )
      .trim();
    const body = withoutConfidence
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+|\s+$/g, '');

    if (!body) {
      return `Risk level: ${riskLevel}\n\nConfidence: ${confidence}`;
    }

    return `Risk level: ${riskLevel}\n\n${body}\n\nConfidence: ${confidence}`;
  }

  private isResponseCompliant(
    value: string,
    firstUserMessage: boolean,
  ): boolean {
    const normalized = value.trim();

    if (!normalized) {
      return false;
    }

    if (GENERIC_PREAMBLE_PATTERN.test(normalized)) {
      return false;
    }

    const lines = normalized
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length === 0 || !/^Risk level:\s*\S/i.test(lines[0])) {
      return false;
    }

    if (!/Confidence:\s*(High|Medium|Low)\b/i.test(normalized)) {
      return false;
    }

    if (firstUserMessage) {
      if (this.countWords(normalized) > FIRST_RESPONSE_MAX_WORDS) {
        return false;
      }

      if (!normalized.endsWith(RESPONSE_DETAILS_FOLLOWUP)) {
        return false;
      }
    }

    return true;
  }

  private buildStructuredAssistantReply(value: string): string {
    const stripped = this.stripGenericPreamble(value);
    const riskLevel = this.extractRiskLevel(stripped);
    const quickAnswer =
      this.limitSentenceBlock(
        this.collapseWhitespace(
          this.extractSection(stripped, 'Quick answer') ??
            this.extractSentenceSummary(stripped, 2, 0),
        ),
        2,
        340,
      ) || 'A final risk classification needs a clearer system definition.';
    const whyRiskLevel =
      this.limitSentenceBlock(
        this.collapseWhitespace(
          this.extractSection(stripped, 'Why this risk level') ??
            this.extractSentenceSummary(stripped, 2, 1),
        ),
        3,
        420,
      ) ||
      'The available details are not specific enough for a definitive label.';
    const confidence = this.extractConfidence(stripped);
    const articlesFromSection = this.extractSection(
      stripped,
      'Applicable AI Act articles',
    );
    const articleMentions = [
      ...this.extractArticleMentions(articlesFromSection ?? ''),
      ...this.extractArticleMentions(stripped),
    ];
    const deduplicatedArticles = [...new Set(articleMentions)].slice(0, 6);
    const articles =
      deduplicatedArticles.length > 0
        ? deduplicatedArticles
        : [
            'Article mapping requires intended purpose, deployment context, and impact details.',
          ];
    const nextActionsSection = this.extractSection(stripped, 'Next actions');
    const nextActions = nextActionsSection
      ? this.extractActionItems(nextActionsSection)
      : this.getDefaultNextActions();
    const missingInfoSection = this.extractSection(
      stripped,
      'Missing information',
    );
    const missingInformation =
      this.collapseWhitespace(missingInfoSection ?? '') ||
      (riskLevel === 'Needs confirmation' || confidence === 'Low'
        ? 'Intended purpose, target users, deployment context, and decision impact details.'
        : '');

    const blocks = [
      `Risk level: ${riskLevel}`,
      `Quick answer: ${quickAnswer}`,
      `Why this risk level: ${whyRiskLevel}`,
      `Applicable AI Act articles:\n${articles.map((entry) => `- ${entry}`).join('\n')}`,
      `Next actions:\n${nextActions
        .map((entry, index) => `${index + 1}. ${entry}`)
        .join('\n')}`,
      `Confidence: ${confidence}`,
    ];

    if (missingInformation) {
      blocks.push(`Missing information: ${missingInformation}`);
    }

    return blocks.join('\n\n').trim();
  }

  private getDefaultNextActions(): string[] {
    return [
      'Confirm intended purpose, users, and deployment context.',
      'Map the use case to prohibited practices and Annex III high-risk domains.',
      'Define risk controls, human oversight, and escalation procedures.',
      'Document data governance, transparency duties, and logging requirements.',
      'Run legal sign-off before production launch.',
    ];
  }

  private stripGenericPreamble(value: string): string {
    const paragraphs = value
      .split(/\n\s*\n/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    if (paragraphs.length === 0) {
      return value.trim();
    }

    if (GENERIC_PREAMBLE_PATTERN.test(paragraphs[0])) {
      paragraphs.shift();
    }

    return paragraphs.join('\n\n').trim() || value.trim();
  }

  private extractRiskLevel(value: string): string {
    const explicit = value.match(/Risk level\s*:\s*([^\n]+)/i)?.[1];
    if (explicit) {
      return this.normalizeRiskLabel(explicit);
    }

    const lower = value.toLowerCase();

    if (lower.includes('prohibited')) {
      return 'Prohibited';
    }

    if (lower.includes('high-risk') || lower.includes('high risk')) {
      return 'High-risk';
    }

    if (lower.includes('limited-risk') || lower.includes('limited risk')) {
      return 'Limited-risk';
    }

    if (
      lower.includes('minimal risk') ||
      lower.includes('low-risk') ||
      lower.includes('low risk')
    ) {
      return 'Low-risk';
    }

    return 'Needs confirmation';
  }

  private normalizeRiskLabel(value: string): string {
    const collapsed = this.collapseWhitespace(this.stripFormatting(value));
    const lower = collapsed.toLowerCase();

    if (!collapsed) {
      return 'Needs confirmation';
    }

    if (lower.includes('prohibited')) {
      return 'Prohibited';
    }

    if (lower.includes('high-risk') || lower.includes('high risk')) {
      return 'High-risk';
    }

    if (lower.includes('limited-risk') || lower.includes('limited risk')) {
      return 'Limited-risk';
    }

    if (
      lower.includes('minimal risk') ||
      lower.includes('low-risk') ||
      lower.includes('low risk')
    ) {
      return 'Low-risk';
    }

    return collapsed.slice(0, 80);
  }

  private extractSection(
    text: string,
    heading: (typeof SECTION_HEADINGS)[number],
  ): string | null {
    const headingsPattern = SECTION_HEADINGS.map((entry) =>
      this.escapeRegex(entry),
    ).join('|');
    const pattern = new RegExp(
      `(?:^|\\n)\\s*(?:#+\\s*)?${this.escapeRegex(heading)}\\s*:?[ \\t]*([\\s\\S]*?)(?=\\n\\s*(?:#+\\s*)?(?:${headingsPattern})\\s*:?[ \\t]*|$)`,
      'i',
    );
    const match = text.match(pattern);

    if (!match?.[1]) {
      return null;
    }

    const extracted = match[1].trim();
    return extracted.length > 0 ? extracted : null;
  }

  private extractConfidence(value: string): 'High' | 'Medium' | 'Low' {
    const explicit = value.match(/Confidence\s*:\s*(High|Medium|Low)\b/i)?.[1];
    if (explicit) {
      return this.normalizeConfidence(explicit);
    }

    const lower = value.toLowerCase();

    if (
      lower.includes('insufficient') ||
      lower.includes('uncertain') ||
      lower.includes('needs confirmation') ||
      lower.includes('cannot conclude')
    ) {
      return 'Low';
    }

    if (
      lower.includes('clearly') ||
      lower.includes('strong evidence') ||
      lower.includes('explicitly')
    ) {
      return 'High';
    }

    return 'Medium';
  }

  private normalizeConfidence(value: string): 'High' | 'Medium' | 'Low' {
    const lower = value.toLowerCase();

    if (lower === 'high') {
      return 'High';
    }

    if (lower === 'low') {
      return 'Low';
    }

    return 'Medium';
  }

  private extractArticleMentions(value: string): string[] {
    const pattern =
      /(?:Article(?:s)?\s+\d+[a-z]?(?:\(\d+\))?|Annex\s+III(?:\s*\([^)]+\))?)/gi;
    const matches = value.match(pattern) ?? [];
    const deduplicated = new Set<string>();
    const entries: string[] = [];

    for (const match of matches) {
      const normalized = this.collapseWhitespace(match);
      const key = normalized.toLowerCase();

      if (key && !deduplicated.has(key)) {
        deduplicated.add(key);
        entries.push(normalized);
      }
    }

    return entries;
  }

  private extractActionItems(value: string): string[] {
    const rawLines = value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) =>
        line
          .replace(/^[-*]\s+/, '')
          .replace(/^\d+[.)]\s+/, '')
          .replace(/^#{1,6}\s+/, ''),
      )
      .filter(
        (line) =>
          !SECTION_HEADINGS.some((heading) =>
            line.toLowerCase().startsWith(heading.toLowerCase()),
          ),
      )
      .map((line) => this.collapseWhitespace(line))
      .filter((line) => line.length > 0 && line.length <= 180);
    const fallbackLines =
      rawLines.length > 0
        ? rawLines
        : this.collapseWhitespace(value)
            .split(/\.\s+|;\s+/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && line.length <= 180);
    const entries = [
      ...new Set(fallbackLines.map((line) => line.slice(0, 160))),
    ];

    if (entries.length > 0) {
      return entries.slice(0, 5);
    }

    return this.getDefaultNextActions();
  }

  private extractSentenceSummary(
    value: string,
    sentenceCount: number,
    skipSentences: number,
  ): string {
    const headingPattern = new RegExp(
      `\\b(?:${SECTION_HEADINGS.map((entry) => this.escapeRegex(entry)).join('|')})\\s*:`,
      'gi',
    );
    const plain = this.stripFormatting(value).replace(headingPattern, ' ');
    const sentences = plain
      .split(/(?<=[.!?])\s+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);

    if (sentences.length === 0) {
      return '';
    }

    return sentences
      .slice(skipSentences, skipSentences + sentenceCount)
      .join(' ');
  }

  private limitSentenceBlock(
    value: string,
    maxSentences: number,
    maxChars: number,
  ): string {
    const normalized = this.collapseWhitespace(value);

    if (!normalized) {
      return '';
    }

    const sentences = normalized
      .split(/(?<=[.!?])\s+/)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    const sentenceLimited =
      sentences.length > 0
        ? sentences.slice(0, maxSentences).join(' ')
        : normalized;

    if (sentenceLimited.length <= maxChars) {
      return sentenceLimited;
    }

    return sentenceLimited
      .slice(0, maxChars)
      .replace(/[-,:;.]+\s*$/, '')
      .trim();
  }

  private stripFormatting(value: string): string {
    return value
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[*_`>#]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private collapseWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
  }

  private applyFirstMessageConstraints(
    value: string,
    firstUserMessage: boolean,
  ): string {
    const normalized = value.trim();

    if (!firstUserMessage || !normalized) {
      return normalized;
    }

    const withoutFollowup = normalized
      .replace(
        new RegExp(`${this.escapeRegex(RESPONSE_DETAILS_FOLLOWUP)}\\s*$`, 'i'),
        '',
      )
      .trim();
    const maxBodyWords = Math.max(
      80,
      FIRST_RESPONSE_MAX_WORDS - this.countWords(RESPONSE_DETAILS_FOLLOWUP),
    );
    const constrainedBody =
      this.countWords(withoutFollowup) > maxBodyWords
        ? this.truncateToWords(withoutFollowup, maxBodyWords)
        : withoutFollowup;

    return `${constrainedBody}\n\n${RESPONSE_DETAILS_FOLLOWUP}`.trim();
  }

  private countWords(value: string): number {
    const trimmed = value.trim();

    if (!trimmed) {
      return 0;
    }

    return trimmed.split(/\s+/).length;
  }

  private truncateToWords(value: string, maxWords: number): string {
    const words = value.trim().split(/\s+/);

    if (words.length <= maxWords) {
      return value.trim();
    }

    return words
      .slice(0, maxWords)
      .join(' ')
      .replace(/[-,:;.]+$/, '')
      .trim();
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private buildAssistantInputMessage(
    message: string,
    context: {
      firstUserMessage: boolean;
      filesAttached: boolean;
    },
  ): string {
    return `[context]
first_user_message=${context.firstUserMessage}
files_attached=${context.filesAttached}
[/context]

${message}`;
  }

  private async getConversationOrThrow(userId: string, conversationId: string) {
    const conversation = await this.prisma.chatConversation.findFirst({
      where: {
        id: conversationId,
        userId,
        deletedAt: null,
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return conversation;
  }

  private async persistErrorMessage(
    conversationId: string,
    message: string,
  ): Promise<void> {
    const normalized = message.trim();

    if (!normalized) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.chatMessage.create({
        data: {
          conversationId,
          role: ChatMessageRole.ERROR,
          content: normalized.slice(0, 2000),
        },
      });

      await tx.chatConversation.update({
        where: {
          id: conversationId,
        },
        data: {
          lastMessageAt: new Date(),
        },
      });
    });
  }
}

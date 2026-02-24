import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { BillingService } from '../billing/billing.service';
import { ChatStreamRequestDto } from './dto/chat-stream-request.dto';
import { CreateChatConversationDto } from './dto/create-chat-conversation.dto';
import { ListChatConversationsQueryDto } from './dto/list-chat-conversations-query.dto';
import { UpdateChatConversationDto } from './dto/update-chat-conversation.dto';
import { ChatService } from './services/chat.service';
import type { UploadedChatFile } from './services/chat.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';

const ALLOWED_UPLOAD_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

@Controller('api')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly billingService: BillingService,
  ) {}

  @Get('chat/conversations')
  @UseGuards(SessionAuthGuard)
  public async listConversations(
    @CurrentUser() user: AuthenticatedUser | null,
    @Req() request: Request,
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: ListChatConversationsQueryDto,
  ) {
    const access = await this.ensureAssistantAccess(user);
    const userId = access.userId;
    await this.chatService.claimAnonymousConversationsForUser(
      userId,
      this.getAnonymousId(request),
    );

    return this.chatService.listConversationsForUser(userId, {
      includeArchived: query.includeArchived,
      search: query.search,
    });
  }

  @Post('chat/conversations')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionAuthGuard)
  public async createConversation(
    @CurrentUser() user: AuthenticatedUser | null,
    @Req() request: Request,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: CreateChatConversationDto,
  ) {
    const access = await this.ensureAssistantAccess(user);
    const userId = access.userId;
    await this.chatService.claimAnonymousConversationsForUser(
      userId,
      this.getAnonymousId(request),
    );

    return this.chatService.createConversationForUser(userId, body.title);
  }

  @Get('chat/conversations/:conversationId')
  @UseGuards(SessionAuthGuard)
  public async getConversation(
    @CurrentUser() user: AuthenticatedUser | null,
    @Req() request: Request,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' }))
    conversationId: string,
  ) {
    const access = await this.ensureAssistantAccess(user);
    const userId = access.userId;
    await this.chatService.claimAnonymousConversationsForUser(
      userId,
      this.getAnonymousId(request),
    );

    return this.chatService.getConversationWithMessagesForUser(
      userId,
      conversationId,
    );
  }

  @Delete('chat/conversations/:conversationId')
  @UseGuards(SessionAuthGuard)
  public async deleteConversation(
    @CurrentUser() user: AuthenticatedUser | null,
    @Req() request: Request,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' }))
    conversationId: string,
  ) {
    const access = await this.ensureAssistantAccess(user);
    const userId = access.userId;
    await this.chatService.claimAnonymousConversationsForUser(
      userId,
      this.getAnonymousId(request),
    );

    return this.chatService.deleteConversationForUser(userId, conversationId);
  }

  @Patch('chat/conversations/:conversationId')
  @UseGuards(SessionAuthGuard)
  public async updateConversation(
    @CurrentUser() user: AuthenticatedUser | null,
    @Req() request: Request,
    @Param('conversationId', new ParseUUIDPipe({ version: '4' }))
    conversationId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: UpdateChatConversationDto,
  ) {
    const access = await this.ensureAssistantAccess(user);
    const userId = access.userId;
    await this.chatService.claimAnonymousConversationsForUser(
      userId,
      this.getAnonymousId(request),
    );

    return this.chatService.updateConversationForUser(
      userId,
      conversationId,
      body,
    );
  }

  @Post('upload')
  @UseGuards(SessionAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
      fileFilter: (_request, file, callback) => {
        if (!ALLOWED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
          callback(new BadRequestException('Unsupported file type.'), false);
          return;
        }

        callback(null, true);
      },
    }),
  )
  public async upload(
    @UploadedFile() file: UploadedChatFile,
    @CurrentUser() user: AuthenticatedUser | null,
  ) {
    await this.ensureAssistantAccess(user);

    if (!file) {
      throw new BadRequestException('No file received');
    }

    return this.chatService.uploadFile(file);
  }

  @Get('chat/trial')
  public async getTrial(
    @CurrentUser() user: AuthenticatedUser | null,
    @Req() request: Request,
  ) {
    const access = await this.resolveTrialAccess(user);
    const context = this.resolveTrialContext(request, access);
    return this.chatService.getTrialState(context);
  }

  @Post('chat/trial/stream')
  public async streamTrial(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: ChatStreamRequestDto,
    @CurrentUser() user: AuthenticatedUser | null,
    @Req() request: Request,
    @Res() res: Response,
  ) {
    const access = await this.resolveTrialAccess(user);
    const context = this.resolveTrialContext(request, access);
    await this.streamTrialConversation(context, body, res);
  }

  @Post('chat/stream')
  @UseGuards(SessionAuthGuard)
  public async streamLegacy(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: ChatStreamRequestDto,
    @CurrentUser() user: AuthenticatedUser | null,
    @Req() request: Request,
    @Res() res: Response,
  ) {
    const access = await this.ensureAssistantAccess(user);
    const userId = access.userId;
    await this.chatService.claimAnonymousConversationsForUser(
      userId,
      this.getAnonymousId(request),
    );

    const conversation = await this.chatService.ensureConversationForStream(
      userId,
      body.conversation_id,
    );

    await this.streamConversation(userId, conversation.id, body, res);
  }

  @Post('chat/conversations/:conversationId/stream')
  @UseGuards(SessionAuthGuard)
  public async streamByConversation(
    @Param('conversationId', new ParseUUIDPipe({ version: '4' }))
    conversationId: string,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: ChatStreamRequestDto,
    @CurrentUser() user: AuthenticatedUser | null,
    @Req() request: Request,
    @Res() res: Response,
  ) {
    const access = await this.ensureAssistantAccess(user);
    const userId = access.userId;
    await this.chatService.claimAnonymousConversationsForUser(
      userId,
      this.getAnonymousId(request),
    );

    await this.streamConversation(userId, conversationId, body, res);
  }

  private async streamConversation(
    userId: string,
    conversationId: string,
    body: ChatStreamRequestDto,
    res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    try {
      for await (const payload of this.chatService.stream(
        userId,
        conversationId,
        body,
      )) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }

      res.write('data: [DONE]\n\n');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Streaming failed';
      res.write(
        `data: ${JSON.stringify({ type: 'error', content: message })}\n\n`,
      );
    } finally {
      res.end();
    }
  }

  private async streamTrialConversation(
    context: {
      userId: string | null;
      anonymousId: string | null;
      hasPremiumAccess: boolean;
    },
    body: ChatStreamRequestDto,
    res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    try {
      for await (const payload of this.chatService.streamTrial(context, body)) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }

      res.write('data: [DONE]\n\n');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Trial streaming failed';
      res.write(
        `data: ${JSON.stringify({ type: 'error', content: message })}\n\n`,
      );
    } finally {
      res.end();
    }
  }

  private resolveTrialContext(
    request: Request,
    access: {
      userId: string | null;
      hasPremiumAccess: boolean;
    },
  ) {
    const anonymousId = this.getAnonymousId(request);

    return {
      userId: access.userId,
      anonymousId,
      hasPremiumAccess: access.hasPremiumAccess,
    };
  }

  private getAnonymousId(request: Request): string | null {
    const raw = request.headers['x-lm-anonymous-id'];

    if (typeof raw === 'string') {
      return raw;
    }

    if (Array.isArray(raw) && raw.length > 0) {
      return raw[0] ?? null;
    }

    return null;
  }

  private getUserId(user: AuthenticatedUser | null): string {
    if (!user?.id) {
      throw new BadRequestException('Authentication required');
    }

    return user.id;
  }

  private async resolveTrialAccess(
    user: AuthenticatedUser | null,
  ): Promise<{ userId: string | null; hasPremiumAccess: boolean }> {
    if (!user?.id) {
      return {
        userId: null,
        hasPremiumAccess: false,
      };
    }

    const roles = user.roles ?? [];

    if (roles.includes('admin') || roles.includes('assistant_access')) {
      return {
        userId: user.id,
        hasPremiumAccess: true,
      };
    }

    const entitlement = await this.billingService.getChatEntitlement(user.id);

    return {
      userId: user.id,
      hasPremiumAccess: entitlement.allowed,
    };
  }

  private async ensureAssistantAccess(
    user: AuthenticatedUser | null,
  ): Promise<{ userId: string; hasPremiumAccess: boolean }> {
    const userId = this.getUserId(user);
    const roles = user?.roles ?? [];

    if (roles.includes('admin') || roles.includes('assistant_access')) {
      return {
        userId,
        hasPremiumAccess: true,
      };
    }

    const entitlement = await this.billingService.getChatEntitlement(userId);

    if (!entitlement.allowed) {
      throw new ForbiddenException(
        'Assistant access is not enabled for this account.',
      );
    }

    return {
      userId,
      hasPremiumAccess: true,
    };
  }
}

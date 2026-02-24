import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';
import type {
  Assistant,
  AssistantTool,
  AssistantStreamEvent,
} from 'openai/resources/beta/assistants';
import type { Stream } from 'openai/streaming';
import {
  ASSISTANT_INSTRUCTIONS,
  ASSISTANT_MODEL,
  ASSISTANT_NAME,
  ASSISTANT_TEMPERATURE,
  ASSISTANT_TOP_P,
} from '../constants/prompt.config';
import { ComplianceToolService } from './compliance-tool.service';

export type ToolOutput = {
  tool_call_id: string;
  output: string;
};

@Injectable()
export class OpenAIAssistantService {
  private readonly logger = new Logger(OpenAIAssistantService.name);
  private readonly client: OpenAI;
  private readonly vectorStoreId: string;
  private assistantId: string | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly complianceTools: ComplianceToolService,
  ) {
    const apiKey = this.configService.getOrThrow<string>('OPENAI_API_KEY');
    this.client = new OpenAI({ apiKey });
    this.vectorStoreId =
      this.configService.get<string>('VECTOR_STORE_ID') ??
      'vs_692180726b908191af2f182b14342882';
  }

  public async uploadFile(fileName: string, bytes: Buffer) {
    const file = await toFile(bytes, fileName);
    return this.client.files.create({ file, purpose: 'assistants' });
  }

  public async createThread() {
    return this.client.beta.threads.create();
  }

  public async createUserMessage(
    threadId: string,
    content: string,
    fileIds?: string[],
  ) {
    const attachments = fileIds?.map((fileId) => ({
      file_id: fileId,
      tools: [{ type: 'file_search' as const }],
    }));

    await this.client.beta.threads.messages.create(threadId, {
      role: 'user',
      content,
      attachments,
    });
  }

  public async createRunStream(
    threadId: string,
  ): Promise<Stream<AssistantStreamEvent>> {
    const assistantId = await this.ensureAssistant();

    return this.client.beta.threads.runs.create(threadId, {
      assistant_id: assistantId,
      stream: true,
    });
  }

  public async warmupAssistant(): Promise<void> {
    await this.ensureAssistant();
  }

  public async submitToolOutputsStream(
    runId: string,
    threadId: string,
    toolOutputs: ToolOutput[],
  ): Promise<Stream<AssistantStreamEvent>> {
    return this.client.beta.threads.runs.submitToolOutputs(runId, {
      thread_id: threadId,
      tool_outputs: toolOutputs,
      stream: true,
    });
  }

  private async ensureAssistant(): Promise<string> {
    if (this.assistantId) {
      return this.assistantId;
    }

    const list = await this.client.beta.assistants.list({
      order: 'desc',
      limit: 20,
    });

    const existing = list.data.find(
      (assistant) => assistant.name === ASSISTANT_NAME,
    );

    if (existing) {
      const updated = await this.updateAssistant(existing.id);
      this.assistantId = updated.id;
      return updated.id;
    }

    const created = await this.client.beta.assistants.create({
      name: ASSISTANT_NAME,
      instructions: ASSISTANT_INSTRUCTIONS,
      model: ASSISTANT_MODEL,
      temperature: ASSISTANT_TEMPERATURE,
      top_p: ASSISTANT_TOP_P,
      tools: this.getAssistantTools(),
      tool_resources: {
        file_search: {
          vector_store_ids: [this.vectorStoreId],
        },
      },
    });

    this.logger.log(`Created assistant ${created.id}`);
    this.assistantId = created.id;

    return created.id;
  }

  private async updateAssistant(assistantId: string): Promise<Assistant> {
    const updated = await this.client.beta.assistants.update(assistantId, {
      instructions: ASSISTANT_INSTRUCTIONS,
      model: ASSISTANT_MODEL,
      temperature: ASSISTANT_TEMPERATURE,
      top_p: ASSISTANT_TOP_P,
      tools: this.getAssistantTools(),
      tool_resources: {
        file_search: {
          vector_store_ids: [this.vectorStoreId],
        },
      },
    });

    this.logger.log(`Updated assistant ${updated.id}`);

    return updated;
  }

  private getAssistantTools(): AssistantTool[] {
    return this.complianceTools.getTools() as AssistantTool[];
  }
}

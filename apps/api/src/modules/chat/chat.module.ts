import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ChatController } from './chat.controller';
import { ChatService } from './services/chat.service';
import { ComplianceToolService } from './services/compliance-tool.service';
import { OpenAIAssistantService } from './services/openai-assistant.service';

@Module({
  imports: [AuthModule, BillingModule],
  controllers: [ChatController],
  providers: [ChatService, ComplianceToolService, OpenAIAssistantService],
})
export class ChatModule {}

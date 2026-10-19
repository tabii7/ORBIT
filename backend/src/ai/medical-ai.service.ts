import { Injectable } from '@nestjs/common';
import { ConversationType } from '@prisma/client';
import { MainAgentService } from './main/main-agent.service';
import {
  AgentChatResult,
  ChatAttachmentInput,
  ChatHistoryItem,
} from './agent.types';

/**
 * Chat entry façade used by ConversationsService.
 * Delegates to MainAgentService (router → Health / Travel sub-agents).
 */
@Injectable()
export class MedicalAiService {
  constructor(private readonly mainAgent: MainAgentService) {}

  chat(params: {
    userId: string;
    userMessage: string;
    history: ChatHistoryItem[];
    conversationType?: ConversationType;
    attachments?: ChatAttachmentInput[];
  }): Promise<AgentChatResult> {
    return this.mainAgent.chat(params);
  }
}

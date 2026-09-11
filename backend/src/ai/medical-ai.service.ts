import { Injectable } from '@nestjs/common';
import { ConversationType } from '@prisma/client';
import {
  ChatAttachmentInput,
  HealthAgentService,
} from './health/health-agent.service';

/** @deprecated Prefer HealthAgentService — kept for existing imports. */
@Injectable()
export class MedicalAiService {
  constructor(private readonly healthAgent: HealthAgentService) {}

  chat(params: {
    userId: string;
    userMessage: string;
    history: Array<{ role: 'USER' | 'ASSISTANT' | 'SYSTEM'; content: string }>;
    conversationType?: ConversationType;
    attachments?: ChatAttachmentInput[];
  }) {
    return this.healthAgent.chat(params);
  }
}

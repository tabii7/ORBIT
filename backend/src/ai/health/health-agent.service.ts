import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { PrismaService } from '../../prisma/prisma.service';
import { RemindersService } from '../../reminders/reminders.service';
import { SymptomsService } from '../../symptoms/symptoms.service';
import { HealthDocumentsService } from '../../health-documents/health-documents.service';
import {
  AgentChatParams,
  AgentChatResult,
  ChatAttachmentInput,
} from '../agent.types';
import { buildAttachmentContext } from '../attachment-context';
import { buildHealthSystemPrompt } from './health-agent.prompt';
import {
  createHealthAgentTools,
  HealthAgentAction,
} from './health-agent.tools';

@Injectable()
export class HealthAgentService {
  private readonly logger = new Logger(HealthAgentService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly remindersService: RemindersService,
    private readonly symptomsService: SymptomsService,
    private readonly healthDocumentsService: HealthDocumentsService,
  ) {}

  async chat(params: AgentChatParams): Promise<AgentChatResult> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const modelName =
      this.config.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';

    const [user, profile, medical, reminders, recentSymptoms, documents] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: params.userId },
          select: { fullName: true },
        }),
        this.prisma.userProfile.findUnique({
          where: { userId: params.userId },
        }),
        this.prisma.medicalProfile.findUnique({
          where: { userId: params.userId },
        }),
        this.remindersService.listForUser(params.userId, { isActive: true }),
        this.symptomsService.list(params.userId),
        this.healthDocumentsService.list(params.userId),
      ]);

    const timezone = profile?.timezone || 'Asia/Dubai';
    const actions: HealthAgentAction[] = [];
    const attachments = params.attachments ?? [];

    const tools = createHealthAgentTools({
      userId: params.userId,
      timezone,
      prisma: this.prisma,
      remindersService: this.remindersService,
      symptomsService: this.symptomsService,
      healthDocumentsService: this.healthDocumentsService,
      actions,
    });

    const model = new ChatOpenAI({
      apiKey,
      model: modelName,
      temperature: 0.2,
    });

    const agent = createReactAgent({
      llm: model,
      tools,
    });

    const attachmentContext = buildAttachmentContext(attachments);
    const docsSummary = documents.slice(0, 10).map((d) => ({
      id: d.id,
      title: d.title,
      category: d.category,
      extractStatus: d.extractStatus,
      hasText: Boolean(d.extractedText),
    }));

    const systemPrompt =
      buildHealthSystemPrompt({
        fullName: user?.fullName || 'User',
        timezone,
        medicalContext: medical,
        reminders,
        recentSymptoms: recentSymptoms.slice(0, 5),
      }) +
      `\n\nStored health documents (metadata): ${JSON.stringify(docsSummary)}` +
      (attachmentContext
        ? `\n\nAttachments on the latest user message:\n${attachmentContext}`
        : '') +
      '\n\nIf the user attached a document/image, READ the extracted text (and image if provided) and answer accordingly. Summarize clearly; do not invent labs or diagnoses. You may call search_health_documents or get_health_document for stored docs.';

    const historyMessages = params.history.slice(-12).map((m) => {
      if (m.role === 'ASSISTANT') return new AIMessage(m.content);
      if (m.role === 'SYSTEM') return new SystemMessage(m.content);
      return new HumanMessage(m.content);
    });

    const humanMessage = this.buildHumanMessage(
      params.userMessage,
      attachments,
    );

    this.logger.debug(
      `Health agent chat for user=${params.userId} attachments=${attachments.length}`,
    );

    const result = await agent.invoke({
      messages: [
        new SystemMessage(systemPrompt),
        ...historyMessages,
        humanMessage,
      ],
    });

    const lastMessage = result.messages[result.messages.length - 1];
    const content =
      typeof lastMessage?.content === 'string'
        ? lastMessage.content
        : JSON.stringify(lastMessage?.content ?? '');

    return {
      message: content,
      actions,
      model: modelName,
      agent: 'HEALTH',
      routedTo: ['HEALTH'],
    };
  }

  private buildHumanMessage(
    userMessage: string,
    attachments: ChatAttachmentInput[],
  ) {
    const images = attachments.filter((a) => a.kind === 'IMAGE' && a.base64);
    if (!images.length) {
      return new HumanMessage(userMessage);
    }

    const parts: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    > = [{ type: 'text', text: userMessage }];

    for (const img of images.slice(0, 3)) {
      parts.push({
        type: 'image_url',
        image_url: {
          url: `data:${img.mimeType};base64,${img.base64}`,
        },
      });
    }

    return new HumanMessage({ content: parts });
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatOpenAI } from '@langchain/openai';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import {
  HumanMessage,
  AIMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { TaskContext } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BusinessNotesService } from '../../business/business-notes.service';
import { BusinessResearchService } from '../../business/business-research.service';
import { TasksService } from '../../productivity/tasks.service';
import {
  AgentChatParams,
  AgentChatResult,
  ChatAttachmentInput,
} from '../agent.types';
import { withAttachmentSystemPrompt } from '../attachment-context';
import { buildBusinessSystemPrompt } from './business-agent.prompt';
import {
  createBusinessAgentTools,
  BusinessAgentAction,
} from './business-agent.tools';

@Injectable()
export class BusinessAgentService {
  private readonly logger = new Logger(BusinessAgentService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly businessNotesService: BusinessNotesService,
    private readonly businessResearchService: BusinessResearchService,
    private readonly tasksService: TasksService,
  ) {}

  async chat(params: AgentChatParams): Promise<AgentChatResult> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const modelName =
      this.config.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';

    const [user, profile, openTasks, recentNotes] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: params.userId },
        select: { fullName: true },
      }),
      this.prisma.userProfile.findUnique({
        where: { userId: params.userId },
      }),
      this.tasksService.list(params.userId, {
        includeDone: false,
        context: TaskContext.BUSINESS,
      }),
      this.businessNotesService.list(params.userId),
    ]);

    const timezone = profile?.timezone || 'Asia/Dubai';
    const actions: BusinessAgentAction[] = [];
    const attachments = params.attachments ?? [];

    const tools = createBusinessAgentTools({
      userId: params.userId,
      businessNotesService: this.businessNotesService,
      businessResearchService: this.businessResearchService,
      tasksService: this.tasksService,
      actions,
    });

    const model = new ChatOpenAI({
      apiKey,
      model: modelName,
      temperature: 0.2,
    });

    const agent = createReactAgent({ llm: model, tools });

    const systemPrompt = withAttachmentSystemPrompt(
      buildBusinessSystemPrompt({
        fullName: user?.fullName || 'User',
        timezone,
        openTasks: openTasks.slice(0, 15).map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          dueAt: t.dueAt,
        })),
        recentNotes: recentNotes.slice(0, 10).map((n) => ({
          id: n.id,
          title: n.title,
          kind: n.kind,
        })),
      }),
      attachments,
    );

    const historyMessages = params.history.slice(-12).map((m) => {
      if (m.role === 'ASSISTANT') return new AIMessage(m.content);
      if (m.role === 'SYSTEM') return new SystemMessage(m.content);
      return new HumanMessage(m.content);
    });

    const humanMessage = this.buildHumanMessage(
      params.userMessage,
      attachments,
    );

    this.logger.debug(`Business agent chat for user=${params.userId}`);

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
      agent: 'BUSINESS',
      routedTo: ['BUSINESS'],
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

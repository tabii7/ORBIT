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
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';
import { TasksService } from '../../productivity/tasks.service';
import { CalendarService } from '../../productivity/calendar.service';
import { DailyPlanService } from '../../productivity/daily-plan.service';
import { DailySummaryService } from '../../notifications/daily-summary.service';
import {
  AgentChatParams,
  AgentChatResult,
  ChatAttachmentInput,
} from '../agent.types';
import { withAttachmentSystemPrompt } from '../attachment-context';
import { buildProductivitySystemPrompt } from './productivity-agent.prompt';
import {
  createProductivityAgentTools,
  ProductivityAgentAction,
} from './productivity-agent.tools';

@Injectable()
export class ProductivityAgentService {
  private readonly logger = new Logger(ProductivityAgentService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly calendarService: CalendarService,
    private readonly dailyPlanService: DailyPlanService,
    private readonly dailySummaryService: DailySummaryService,
  ) {}

  async chat(params: AgentChatParams): Promise<AgentChatResult> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const modelName =
      this.config.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';

    const [user, profile, openTasks] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: params.userId },
        select: { fullName: true },
      }),
      this.prisma.userProfile.findUnique({
        where: { userId: params.userId },
      }),
      this.tasksService.list(params.userId, {
        includeDone: false,
        context: TaskContext.PERSONAL,
      }),
    ]);

    const timezone = profile?.timezone || 'Asia/Dubai';
    const todayEvents = await this.calendarService.listForDay(
      params.userId,
      DateTime.now().setZone(timezone),
    );

    const actions: ProductivityAgentAction[] = [];
    const attachments = params.attachments ?? [];

    const tools = createProductivityAgentTools({
      userId: params.userId,
      timezone,
      tasksService: this.tasksService,
      calendarService: this.calendarService,
      dailyPlanService: this.dailyPlanService,
      dailySummaryService: this.dailySummaryService,
      actions,
    });

    const model = new ChatOpenAI({
      apiKey,
      model: modelName,
      temperature: 0.2,
    });

    const agent = createReactAgent({ llm: model, tools });

    const systemPrompt = withAttachmentSystemPrompt(
      buildProductivitySystemPrompt({
        fullName: user?.fullName || 'User',
        timezone,
        openTasks: openTasks.slice(0, 20).map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueAt: t.dueAt,
        })),
        todayEvents: todayEvents.map((e) => ({
          id: e.id,
          title: e.title,
          startAt: e.startAt,
          endAt: e.endAt,
          location: e.location,
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

    this.logger.debug(`Productivity agent chat for user=${params.userId}`);

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
      agent: 'PRODUCTIVITY',
      routedTo: ['PRODUCTIVITY'],
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

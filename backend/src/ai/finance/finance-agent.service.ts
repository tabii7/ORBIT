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
import { BudgetService } from '../../finance/budget.service';
import { WatchlistService } from '../../finance/watchlist.service';
import { FinanceAlertService } from '../../finance/finance-alert.service';
import { FinanceSearchService } from '../../finance/finance-search.service';
import {
  AgentChatParams,
  AgentChatResult,
  ChatAttachmentInput,
} from '../agent.types';
import { withAttachmentSystemPrompt } from '../attachment-context';
import { buildFinanceSystemPrompt } from './finance-agent.prompt';
import {
  createFinanceAgentTools,
  FinanceAgentAction,
} from './finance-agent.tools';

@Injectable()
export class FinanceAgentService {
  private readonly logger = new Logger(FinanceAgentService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly budgetService: BudgetService,
    private readonly watchlistService: WatchlistService,
    private readonly financeAlertService: FinanceAlertService,
    private readonly financeSearchService: FinanceSearchService,
  ) {}

  async chat(params: AgentChatParams): Promise<AgentChatResult> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const modelName =
      this.config.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';

    const [user, profile, budgetSummary, watchlist, alerts] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: params.userId },
          select: { fullName: true },
        }),
        this.prisma.userProfile.findUnique({
          where: { userId: params.userId },
        }),
        this.budgetService.summary(params.userId),
        this.watchlistService.list(params.userId),
        this.financeAlertService.list(params.userId),
      ]);

    const timezone = profile?.timezone || 'Asia/Dubai';
    const actions: FinanceAgentAction[] = [];
    const attachments = params.attachments ?? [];

    const tools = createFinanceAgentTools({
      userId: params.userId,
      budgetService: this.budgetService,
      watchlistService: this.watchlistService,
      financeAlertService: this.financeAlertService,
      financeSearchService: this.financeSearchService,
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

    const systemPrompt = withAttachmentSystemPrompt(
      buildFinanceSystemPrompt({
        fullName: user?.fullName || 'User',
        timezone,
        budgetSummary,
        watchlist: watchlist.map((w) => ({
          id: w.id,
          symbol: w.symbol,
          market: w.market,
          displayName: w.displayName,
        })),
        alerts: alerts
          .filter((a) => a.isActive)
          .map((a) => ({
            id: a.id,
            symbol: a.symbol,
            condition: a.condition,
            threshold: a.threshold,
            currency: a.currency,
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

    this.logger.debug(`Finance agent chat for user=${params.userId}`);

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
      agent: 'FINANCE',
      routedTo: ['FINANCE'],
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

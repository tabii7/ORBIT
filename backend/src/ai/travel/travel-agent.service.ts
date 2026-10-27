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
import { TravelPreferencesService } from '../../travel/travel-preferences.service';
import { TravelSearchService } from '../../travel/travel-search.service';
import { TravelCompareService } from '../../travel/travel-compare.service';
import { TravelTripService } from '../../travel/travel-trip.service';
import { TravelPlannerService } from '../../travel/travel-planner.service';
import { ProfileService } from '../../profile/profile.service';
import {
  AgentChatParams,
  AgentChatResult,
  ChatAttachmentInput,
} from '../agent.types';
import { withAttachmentSystemPrompt } from '../attachment-context';
import { buildTravelSystemPrompt } from './travel-agent.prompt';
import {
  createTravelAgentTools,
  TravelAgentAction,
} from './travel-agent.tools';

@Injectable()
export class TravelAgentService {
  private readonly logger = new Logger(TravelAgentService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly remindersService: RemindersService,
    private readonly travelPreferencesService: TravelPreferencesService,
    private readonly travelSearchService: TravelSearchService,
    private readonly travelCompareService: TravelCompareService,
    private readonly travelTripService: TravelTripService,
    private readonly travelPlannerService: TravelPlannerService,
    private readonly profileService: ProfileService,
  ) {}

  async chat(params: AgentChatParams): Promise<AgentChatResult> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const modelName =
      this.config.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';

    const [user, profile, travelPrefs, trips] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: params.userId },
        select: { fullName: true },
      }),
      this.prisma.userProfile.findUnique({
        where: { userId: params.userId },
      }),
      this.travelPreferencesService.get(params.userId),
      this.travelTripService.list(params.userId),
    ]);

    const timezone = profile?.timezone || 'Asia/Dubai';
    const actions: TravelAgentAction[] = [];
    const attachments = params.attachments ?? [];

    const tools = createTravelAgentTools({
      userId: params.userId,
      timezone,
      travelPreferencesService: this.travelPreferencesService,
      travelSearchService: this.travelSearchService,
      travelCompareService: this.travelCompareService,
      travelTripService: this.travelTripService,
      travelPlannerService: this.travelPlannerService,
      remindersService: this.remindersService,
      profileService: this.profileService,
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

    const tripsSummary = trips.slice(0, 5).map((t) => ({
      id: t.id,
      title: t.title,
      destination: t.destination,
      status: t.status,
      startDate: t.startDate,
      endDate: t.endDate,
      offerCount: t.offers.length,
    }));

    const systemPrompt = withAttachmentSystemPrompt(
      buildTravelSystemPrompt({
        fullName: user?.fullName || 'User',
        timezone,
        travelPreferences: travelPrefs,
        tripsSummary,
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

    this.logger.debug(
      `Travel agent chat for user=${params.userId} attachments=${attachments.length}`,
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
      agent: 'TRAVEL',
      routedTo: ['TRAVEL'],
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

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { HealthAgentService } from '../health/health-agent.service';
import { TravelAgentService } from '../travel/travel-agent.service';
import { FinanceAgentService } from '../finance/finance-agent.service';
import { ProductivityAgentService } from '../productivity/productivity-agent.service';
import { BusinessAgentService } from '../business/business-agent.service';
import {
  AgentChatParams,
  AgentChatResult,
  AgentDomain,
  ChatAttachmentInput,
} from '../agent.types';
import { attachmentRoutingHint } from '../attachment-context';
import { MAIN_AGENT_ROUTER_PROMPT } from './main-agent.prompt';
import { assertChatOpenAiAllowed } from '../openai-chat-scope';

const DOMAIN_LABEL: Record<AgentDomain, string> = {
  HEALTH: 'Health',
  TRAVEL: 'Travel',
  FINANCE: 'Finance',
  PRODUCTIVITY: 'Productivity',
  BUSINESS: 'Business',
};

@Injectable()
export class MainAgentService {
  private readonly logger = new Logger(MainAgentService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly healthAgent: HealthAgentService,
    private readonly travelAgent: TravelAgentService,
    private readonly financeAgent: FinanceAgentService,
    private readonly productivityAgent: ProductivityAgentService,
    private readonly businessAgent: BusinessAgentService,
  ) {}

  async chat(params: AgentChatParams): Promise<AgentChatResult> {
    assertChatOpenAiAllowed('main-agent');

    const domains = await this.classify(
      params.userMessage,
      params.history,
      params.attachments,
    );
    this.logger.log(
      `Main router → domains=[${domains.join(',')}] user=${params.userId}`,
    );

    const results: AgentChatResult[] = [];
    for (const domain of domains) {
      if (domain === 'TRAVEL') {
        results.push(await this.travelAgent.chat(params));
      } else if (domain === 'FINANCE') {
        results.push(await this.financeAgent.chat(params));
      } else if (domain === 'PRODUCTIVITY') {
        results.push(await this.productivityAgent.chat(params));
      } else if (domain === 'BUSINESS') {
        results.push(await this.businessAgent.chat(params));
      } else {
        results.push(await this.healthAgent.chat(params));
      }
    }

    if (results.length === 1) {
      return {
        ...results[0],
        routedTo: domains,
      };
    }

    const message = results
      .map((r, i) => {
        const label = DOMAIN_LABEL[domains[i]] || domains[i];
        return `### ${label}\n\n${r.message}`;
      })
      .join('\n\n---\n\n');

    const actions = results.flatMap((r) => r.actions);
    const model = results.map((r) => r.model).join('+');

    return {
      message,
      actions,
      model,
      agent: 'MAIN',
      routedTo: domains,
    };
  }

  async classify(
    userMessage: string,
    history: AgentChatParams['history'],
    attachments?: ChatAttachmentInput[],
  ): Promise<AgentDomain[]> {
    const heuristic = this.heuristicDomains(userMessage, attachments);
    if (heuristic.length === 1 && this.isStrongSingleDomain(userMessage)) {
      return heuristic;
    }

    // Attachment-only / "read this doc" with no other domain → prefer hint
    if (
      attachments?.length &&
      heuristic.length === 0 &&
      this.isDocumentReadRequest(userMessage)
    ) {
      const hint = attachmentRoutingHint(attachments);
      return [hint as AgentDomain];
    }

    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      if (attachments?.length) {
        return [attachmentRoutingHint(attachments) as AgentDomain];
      }
      return heuristic.length ? heuristic : ['HEALTH'];
    }

    try {
      const modelName =
        this.config.get<string>('OPENAI_ROUTER_MODEL') ||
        this.config.get<string>('OPENAI_MODEL') ||
        'gpt-4o-mini';

      const client = new OpenAI({ apiKey });
      const recent = history
        .slice(-4)
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');

      const attachMeta = attachments?.length
        ? attachments
            .map(
              (a) =>
                `${a.kind}:${a.originalName} extract=${a.extractStatus || 'n/a'} snippet=${(a.extractedText || '').slice(0, 200)}`,
            )
            .join('\n')
        : '';

      const completion = await client.chat.completions.create({
        model: modelName,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: MAIN_AGENT_ROUTER_PROMPT },
          {
            role: 'user',
            content: [
              recent ? `Recent chat:\n${recent}\n` : '',
              `Latest user message:\n${userMessage}`,
              attachMeta ? `\nAttachments:\n${attachMeta}` : '',
              heuristic.length
                ? `\nHeuristic hint: ${JSON.stringify(heuristic)}`
                : '',
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(raw) as { domains?: string[] };
      const domains = this.normalizeDomains(parsed.domains);
      if (domains.length) return domains;
    } catch (err) {
      this.logger.warn(
        `Main router classify failed, using heuristic: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    if (heuristic.length) return heuristic;
    if (attachments?.length) {
      return [attachmentRoutingHint(attachments) as AgentDomain];
    }
    return ['HEALTH'];
  }

  private isDocumentReadRequest(message: string): boolean {
    const text = message.toLowerCase().trim();
    if (!text) return true;
    if (/^\[attached /i.test(text)) return true;
    return /\b(what does (this|the) (say|mean)|summarize|summary|explain (this|the) (report|document|image|lab|result)|read (this|the) (document|file|report|image)|analyse|analyze|ocr)\b/.test(
      text,
    );
  }

  private normalizeDomains(raw?: string[]): AgentDomain[] {
    if (!raw?.length) return [];
    const out: AgentDomain[] = [];
    for (const d of raw) {
      const u = String(d).toUpperCase();
      if (u === 'TRAVEL' && !out.includes('TRAVEL')) out.push('TRAVEL');
      if (u === 'FINANCE' && !out.includes('FINANCE')) out.push('FINANCE');
      if (u === 'PRODUCTIVITY' && !out.includes('PRODUCTIVITY')) {
        out.push('PRODUCTIVITY');
      }
      if (u === 'BUSINESS' && !out.includes('BUSINESS')) out.push('BUSINESS');
      if (
        (u === 'HEALTH' || u === 'GENERAL') &&
        !out.includes('HEALTH')
      ) {
        out.push('HEALTH');
      }
    }
    return out;
  }

  private heuristicDomains(
    message: string,
    attachments?: ChatAttachmentInput[],
  ): AgentDomain[] {
    const text = message.toLowerCase();
    const travelHits =
      /\b(hotel|hotels|flight|flights|trip|trips|travel|airport|airline|booking\.com|check[- ]?in|itinerary|visa|destination|cabin|layover|coupon|coupons|promo code|discount code|travel deal|hotel deal|flight deal|promotional|where should i (go|travel)|tourist|sightseeing|airport transfer|car rental|travel budget)\b/.test(
        text,
      );
    const healthHits =
      /\b(medicine|medication|metformin|panadol|pill|dose|symptom|allergy|allergic|doctor|clinic|appointment|blood|prescription|lab|cough|fever|pain|insulin|vitamin|lab report|medical report|reminders?|my reminders?|all reminders?|list (my )?reminders?|show (my )?reminders?)\b/.test(
        text,
      );
    const financeHits =
      /\b(budget|expense|expenses|spent|spending|income|salary|stock|stocks|share|shares|watchlist|adx|ticker|portfolio|price alert|fab\.ad|invest|dividend|i spent|log (an )?expense|halal|haram|sharia|shariah|islamic finance|bitcoin|btc|crypto|gold|lithium|xau)\b/.test(
        text,
      ) || /\b(aed\s*\d|\d+\s*aed)\b/.test(text);
    const businessHits =
      /\b(business note|business task|business checklist|business plan|competitor|competitors|market research|client follow[- ]?up|proposal|invoice|crm|pitch deck|go[- ]?to[- ]?market|gtm)\b/.test(
        text,
      ) ||
      /\b(research .*(competitor|market|industry|sme|startup|client))\b/.test(
        text,
      ) ||
      /\b(note:.*(acme|client|proposal|invoice|deal))\b/.test(text);
    const productivityHits =
      /\b(task|tasks|todo|to-?do|checklist|calendar|meeting|meetings|standup|schedule|agenda|organize my day|plan my day|daily plan|daily summary|good morning|follow[- ]?up)\b/.test(
        text,
      ) && !businessHits;

    const domains: AgentDomain[] = [];
    if (travelHits) domains.push('TRAVEL');
    if (financeHits) domains.push('FINANCE');
    if (businessHits) domains.push('BUSINESS');
    if (productivityHits) domains.push('PRODUCTIVITY');
    if (healthHits) domains.push('HEALTH');

    if (!domains.length && attachments?.length) {
      const hint = attachmentRoutingHint(attachments);
      if (hint === 'TRAVEL') domains.push('TRAVEL');
      else if (hint === 'FINANCE') domains.push('FINANCE');
      else if (hint === 'BUSINESS') domains.push('BUSINESS');
      else domains.push('HEALTH');
    }

    return domains;
  }

  private isStrongSingleDomain(message: string): boolean {
    const text = message.toLowerCase();
    const travelOnly =
      /\b(find hotels?|search hotels?|flights? to|plan (a |my )?trip|book(ing)? (hotel|flight)|hotel coupons?|promo codes?|travel deals?|discount coupons?)\b/.test(
        text,
      ) &&
      !/\b(medicine|metformin|budget|stock|task|calendar|meeting|business)\b/.test(
        text,
      );
    const healthOnly =
      /\b(remind me .*(medicine|metformin|panadol|pill|dose)|i am allergic|log (my )?symptom|doctor (tomorrow|today|at)|(list|show|get|what are|all) (my )?reminders?|my reminders? list)\b/.test(
        text,
      ) &&
      !/\b(hotel|flight|budget|stock|task|calendar|organize my day|business)\b/.test(
        text,
      );
    const financeOnly =
      /\b(i spent|log (an )?expense|add .+ to (my )?watchlist|price alert|budget summary|stock price|adx (news|market)|market (and )?stock|stock highlights|live (rate|price|market)|today'?s market|is .+ halal|halal stock|haram stock|sharia|bitcoin|gold price|lithium market)\b/.test(
        text,
      ) &&
      !/\b(hotel|flight|medicine|task|calendar|meeting|business)\b/.test(text);
    const businessOnly =
      /\b(business (note|task|checklist|plan)|create (a )?business (note|task)|research (competitors?|market)|competitor research|business checklist)\b/.test(
        text,
      ) &&
      !/\b(hotel|flight|medicine|metformin|allergy|budget|stock|adx|calendar|meeting)\b/.test(
        text,
      );
    const productivityOnly =
      /\b(add (a )?task|create (a )?task|to-?do|organize my day|plan my day|daily summary|what('?s| is) my (daily )?summary|calendar event|meeting (with|at|tomorrow)|schedule (a )?meeting)\b/.test(
        text,
      ) &&
      !/\b(hotel|flight|medicine|metformin|allergy|budget|stock|adx|business)\b/.test(
        text,
      );
    return (
      travelOnly ||
      healthOnly ||
      financeOnly ||
      businessOnly ||
      productivityOnly
    );
  }
}

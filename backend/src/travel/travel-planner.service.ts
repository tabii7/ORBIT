import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { assertChatOpenAiAllowed } from '../ai/openai-chat-scope';
import { resolveHotelProvider } from './travel-ota';

const DISCLAIMER =
  'Estimates and suggestions only. Verify on partner sites before booking. ORBIT does not book or charge. Prices are not confirmed until you complete checkout externally.';

export type DestinationIdea = {
  name: string;
  country: string | null;
  why: string;
  bestFor: string[];
  estimatedDailyBudget: number | null;
  currency: string | null;
  sourceUrl: string | null;
};

export type BudgetBreakdown = {
  flights: number | null;
  accommodation: number | null;
  localTransport: number | null;
  food: number | null;
  activities: number | null;
  other: number | null;
  total: number | null;
  currency: string;
  notes: string | null;
};

export type TransportOption = {
  title: string;
  mode: string;
  estimatedCost: number | null;
  currency: string | null;
  duration: string | null;
  sourceUrl: string | null;
  provider: string | null;
  external: true;
};

export type GuidePlace = {
  name: string;
  category: string;
  why: string;
  estimatedFee: string | null;
  tip: string | null;
  sourceUrl: string | null;
};

export type ItineraryPlan = {
  style: string;
  title: string;
  days: Array<{ day: number; title: string; activities: string[] }>;
  estimatedTotal: number | null;
  currency: string | null;
  differences: string | null;
};

@Injectable()
export class TravelPlannerService {
  private readonly logger = new Logger(TravelPlannerService.name);

  constructor(private readonly config: ConfigService) {}

  private get apiKey() {
    return this.config.get<string>('OPENAI_API_KEY') || '';
  }

  private get model() {
    return (
      this.config.get<string>('OPENAI_SEARCH_MODEL') ||
      this.config.get<string>('OPENAI_MODEL') ||
      'gpt-4o-mini'
    );
  }

  /** A — Destination recommendations */
  async recommendDestinations(params: {
    interests?: string;
    budget?: number;
    currency?: string;
    travelPurpose?: string;
    dates?: string;
    weatherPref?: string;
    origin?: string;
  }) {
    const query = [
      'Suggest real travel destinations matching:',
      params.travelPurpose
        ? `purpose=${params.travelPurpose}`
        : 'purpose=general',
      params.interests ? `interests=${params.interests}` : null,
      params.budget != null
        ? `budget≈${params.budget} ${params.currency || 'AED'}`
        : null,
      params.dates ? `dates=${params.dates}` : null,
      params.weatherPref ? `weather=${params.weatherPref}` : null,
      params.origin ? `from=${params.origin}` : null,
      'Return only real places. Prefer destinations with public tourism info.',
    ]
      .filter(Boolean)
      .join('. ');

    const system = [
      'You are ORBIT destination recommender.',
      'Use web search. Do NOT invent destinations, URLs, or prices.',
      'If unsure, return fewer items. Never fabricate sourceUrl — use null if none.',
      'Respond JSON only:',
      '{"summary":"...","destinations":[{"name":"...","country":"...","why":"...","bestFor":["family"],"estimatedDailyBudget":100,"currency":"AED","sourceUrl":"https://... or null"}]}',
    ].join(' ');

    return this.runJsonSearch<{
      summary: string | null;
      destinations: DestinationIdea[];
    }>({
      kind: 'destinations',
      query,
      system,
      parse: (raw) => {
        const destinations = (raw.destinations ?? [])
          .filter((d: { name?: string }) => d.name?.trim())
          .slice(0, 6)
          .map((d: Record<string, unknown>) => ({
            name: String(d.name).trim(),
            country: d.country ? String(d.country) : null,
            why: d.why ? String(d.why) : '',
            bestFor: Array.isArray(d.bestFor)
              ? d.bestFor.map(String).slice(0, 6)
              : [],
            estimatedDailyBudget:
              typeof d.estimatedDailyBudget === 'number'
                ? d.estimatedDailyBudget
                : null,
            currency: d.currency ? String(d.currency) : null,
            sourceUrl: this.safeHttps(d.sourceUrl),
          }));
        return {
          summary: raw.summary ? String(raw.summary) : null,
          destinations,
        };
      },
      empty: { summary: null, destinations: [] },
    });
  }

  /** B — Travel budget breakdown (estimates only) */
  async estimateTravelBudget(params: {
    destination: string;
    nights?: number;
    adults?: number;
    totalBudget?: number;
    currency?: string;
    style?: string;
  }) {
    const nights = params.nights ?? 3;
    const adults = params.adults ?? 2;
    const currency = params.currency || 'AED';
    const query = [
      `Estimate a realistic travel budget breakdown for ${params.destination}`,
      `${nights} nights`,
      `${adults} adults`,
      params.totalBudget != null
        ? `target total around ${params.totalBudget} ${currency}`
        : null,
      params.style ? `style=${params.style}` : null,
      'Include flights, accommodation, local transport, food, activities as estimates with sources if possible.',
    ]
      .filter(Boolean)
      .join('. ');

    const system = [
      'You are ORBIT travel budget estimator.',
      'Use web search for typical/current cost ranges. Do NOT invent precise fake prices as confirmed.',
      'All numbers are ESTIMATES. If unknown, use null.',
      'Respond JSON only:',
      `{"summary":"...","currency":"${currency}","breakdown":{"flights":null,"accommodation":null,"localTransport":null,"food":null,"activities":null,"other":null,"total":null},"notes":"...","sources":[{"title":"...","url":"https://..."}]}`,
    ].join(' ');

    return this.runJsonSearch<{
      summary: string | null;
      currency: string;
      breakdown: BudgetBreakdown;
      notes: string | null;
      sources: Array<{ title: string; url: string }>;
    }>({
      kind: 'budget',
      query,
      system,
      parse: (raw) => {
        const b = (raw.breakdown || {}) as Record<string, unknown>;
        const num = (v: unknown) =>
          typeof v === 'number' && Number.isFinite(v) ? v : null;
        const breakdown: BudgetBreakdown = {
          flights: num(b.flights),
          accommodation: num(b.accommodation),
          localTransport: num(b.localTransport),
          food: num(b.food),
          activities: num(b.activities),
          other: num(b.other),
          total: num(b.total),
          currency: String(raw.currency || currency),
          notes: raw.notes ? String(raw.notes) : null,
        };
        const sources = this.parseSources(raw.sources);
        return {
          summary: raw.summary ? String(raw.summary) : null,
          currency: breakdown.currency,
          breakdown,
          notes: breakdown.notes,
          sources,
        };
      },
      empty: {
        summary: null,
        currency,
        breakdown: {
          flights: null,
          accommodation: null,
          localTransport: null,
          food: null,
          activities: null,
          other: null,
          total: null,
          currency,
          notes: null,
        },
        notes: null,
        sources: [],
      },
    });
  }

  /** E — Local transport / transfers */
  async searchLocalTransport(params: {
    destination: string;
    need?: string;
    from?: string;
    to?: string;
  }) {
    const query = [
      `Local transportation options in ${params.destination}`,
      params.need || 'airport transfer, taxi, metro, bus, car rental',
      params.from && params.to ? `from ${params.from} to ${params.to}` : null,
      'Find real booking or info pages with estimated costs when available.',
    ]
      .filter(Boolean)
      .join('. ');

    const system = [
      'You are ORBIT local transport search.',
      'Use web search. Do NOT invent URLs or prices. Omit unknown fields as null.',
      'Respond JSON only:',
      '{"summary":"...","options":[{"title":"...","mode":"taxi|metro|bus|train|car_rental|transfer|other","estimatedCost":null,"currency":null,"duration":null,"sourceUrl":"https://..."}]}',
    ].join(' ');

    return this.runJsonSearch<{
      summary: string | null;
      options: TransportOption[];
    }>({
      kind: 'transport',
      query,
      system,
      parse: (raw) => {
        const options: TransportOption[] = (raw.options ?? [])
          .filter((o: { title?: string }) => o.title?.trim())
          .slice(0, 8)
          .map((o: Record<string, unknown>) => {
            const url = this.safeHttps(o.sourceUrl);
            return {
              title: String(o.title).trim(),
              mode: o.mode ? String(o.mode) : 'other',
              estimatedCost:
                typeof o.estimatedCost === 'number' ? o.estimatedCost : null,
              currency: o.currency ? String(o.currency) : null,
              duration: o.duration ? String(o.duration) : null,
              sourceUrl: url,
              provider: url ? resolveHotelProvider(url).provider : null,
              external: true as const,
            };
          });
        return {
          summary: raw.summary ? String(raw.summary) : null,
          options,
        };
      },
      empty: { summary: null, options: [] },
    });
  }

  /** F — Tourist guide */
  async destinationGuide(params: {
    destination: string;
    interests?: string;
    days?: number;
  }) {
    const query = [
      `Tourist guide for ${params.destination}`,
      params.interests ? `interests=${params.interests}` : null,
      params.days ? `${params.days}-day visit ideas` : null,
      'Major attractions, food, shopping, tips with real source links when available.',
    ]
      .filter(Boolean)
      .join('. ');

    const system = [
      'You are ORBIT tourist guide.',
      'Use web search. Do NOT invent attractions or URLs. Fees as text estimates or null.',
      'Respond JSON only:',
      '{"summary":"...","places":[{"name":"...","category":"attraction|food|shopping|culture|family|other","why":"...","estimatedFee":null,"tip":null,"sourceUrl":null}],"tips":["..."]}',
    ].join(' ');

    return this.runJsonSearch<{
      summary: string | null;
      places: GuidePlace[];
      tips: string[];
    }>({
      kind: 'guide',
      query,
      system,
      parse: (raw) => ({
        summary: raw.summary ? String(raw.summary) : null,
        places: (raw.places ?? [])
          .filter((p: { name?: string }) => p.name?.trim())
          .slice(0, 12)
          .map((p: Record<string, unknown>) => ({
            name: String(p.name).trim(),
            category: p.category ? String(p.category) : 'other',
            why: p.why ? String(p.why) : '',
            estimatedFee: p.estimatedFee ? String(p.estimatedFee) : null,
            tip: p.tip ? String(p.tip) : null,
            sourceUrl: this.safeHttps(p.sourceUrl),
          })),
        tips: Array.isArray(raw.tips)
          ? raw.tips.map(String).slice(0, 8)
          : [],
      }),
      empty: { summary: null, places: [], tips: [] },
    });
  }

  /** G — Multiple itinerary styles */
  async generateItineraryOptions(params: {
    destination: string;
    days?: number;
    budget?: number;
    currency?: string;
    interests?: string;
  }) {
    const days = params.days ?? 3;
    const query = [
      `Create ${days}-day itinerary options for ${params.destination}`,
      'Include styles: budget-friendly, balanced, premium (and family/adventure if relevant)',
      params.budget != null
        ? `budget≈${params.budget} ${params.currency || 'AED'}`
        : null,
      params.interests ? `interests=${params.interests}` : null,
      'Base activities on real attractions from web search. Do not invent places.',
    ]
      .filter(Boolean)
      .join('. ');

    const system = [
      'You are ORBIT itinerary planner.',
      'Use web search for real places. Do NOT invent attractions or confirmed prices.',
      'estimatedTotal is ESTIMATE or null.',
      'Respond JSON only:',
      '{"summary":"...","plans":[{"style":"budget|balanced|premium|family|adventure|relaxation","title":"...","days":[{"day":1,"title":"...","activities":["..."]}],"estimatedTotal":null,"currency":"AED","differences":"..."}]}',
    ].join(' ');

    return this.runJsonSearch<{
      summary: string | null;
      plans: ItineraryPlan[];
    }>({
      kind: 'itineraries',
      query,
      system,
      parse: (raw) => ({
        summary: raw.summary ? String(raw.summary) : null,
        plans: (raw.plans ?? [])
          .filter((p: { title?: string }) => p.title?.trim())
          .slice(0, 5)
          .map((p: Record<string, unknown>) => ({
            style: p.style ? String(p.style) : 'balanced',
            title: String(p.title).trim(),
            days: Array.isArray(p.days)
              ? p.days.slice(0, 14).map((d: Record<string, unknown>, i: number) => ({
                  day: typeof d.day === 'number' ? d.day : i + 1,
                  title: d.title ? String(d.title) : `Day ${i + 1}`,
                  activities: Array.isArray(d.activities)
                    ? d.activities.map(String).slice(0, 10)
                    : [],
                }))
              : [],
            estimatedTotal:
              typeof p.estimatedTotal === 'number' ? p.estimatedTotal : null,
            currency: p.currency ? String(p.currency) : params.currency || null,
            differences: p.differences ? String(p.differences) : null,
          })),
      }),
      empty: { summary: null, plans: [] },
    });
  }

  private safeHttps(url: unknown): string | null {
    if (typeof url !== 'string') return null;
    const u = url.trim();
    if (!/^https:\/\//i.test(u)) return null;
    if (/example\.com|placeholder/i.test(u)) return null;
    return u;
  }

  private parseSources(raw: unknown): Array<{ title: string; url: string }> {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (s: { title?: string; url?: string }) =>
          s?.title && this.safeHttps(s.url),
      )
      .map((s: { title: string; url: string }) => ({
        title: s.title,
        url: this.safeHttps(s.url)!,
      }))
      .slice(0, 8);
  }

  private async runJsonSearch<T>(params: {
    kind: string;
    query: string;
    system: string;
    parse: (raw: Record<string, any>) => T;
    empty: T;
  }): Promise<{
    ok: boolean;
    data: T;
    error?: string;
    disclaimer: string;
  }> {
    try {
      assertChatOpenAiAllowed(`travel-planner:${params.kind}`);
    } catch (error) {
      return {
        ok: false,
        data: params.empty,
        error: error instanceof Error ? error.message : String(error),
        disclaimer: DISCLAIMER,
      };
    }

    if (!this.apiKey) {
      return {
        ok: false,
        data: params.empty,
        error: 'OPENAI_API_KEY is not configured',
        disclaimer: DISCLAIMER,
      };
    }

    const client = new OpenAI({ apiKey: this.apiKey });
    try {
      const response = await client.responses.create({
        model: this.model,
        tools: [{ type: 'web_search' }],
        tool_choice: 'required',
        include: ['web_search_call.action.sources'],
        input: [
          { role: 'system', content: params.system },
          { role: 'user', content: params.query },
        ],
      });

      const answer =
        typeof response.output_text === 'string'
          ? response.output_text
          : undefined;
      const raw = this.extractJson(answer);
      if (!raw) {
        return {
          ok: true,
          data: params.empty,
          disclaimer: DISCLAIMER,
        };
      }
      return {
        ok: true,
        data: params.parse(raw),
        disclaimer: DISCLAIMER,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Travel planner ${params.kind} failed: ${message}`);
      return {
        ok: false,
        data: params.empty,
        error: message,
        disclaimer: DISCLAIMER,
      };
    }
  }

  private extractJson(text: string | undefined): Record<string, any> | null {
    if (!text) return null;
    try {
      const cleaned = text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start < 0 || end <= start) return null;
      return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, any>;
    } catch {
      return null;
    }
  }
}

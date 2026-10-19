import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { assertChatOpenAiAllowed } from '../ai/openai-chat-scope';

export type TravelSearchHit = {
  title: string;
  url: string;
  content: string;
  score?: number;
  price?: number;
  currency?: string;
  stars?: number;
  airline?: string;
  durationMinutes?: number;
  stops?: number;
};

type SearchOutcome = {
  ok: boolean;
  answer?: string;
  results: TravelSearchHit[];
  error?: string;
};

@Injectable()
export class TravelSearchService {
  private readonly logger = new Logger(TravelSearchService.name);

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

  isConfigured() {
    return Boolean(this.apiKey);
  }

  async search(params: {
    query: string;
    maxResults?: number;
    includeDomains?: string[];
    kind: 'hotels' | 'flights';
  }): Promise<SearchOutcome> {
    try {
      assertChatOpenAiAllowed(`travel-search:${params.kind}`);
    } catch (error) {
      return {
        ok: false,
        results: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }

    if (!this.apiKey) {
      return {
        ok: false,
        results: [],
        error:
          'OPENAI_API_KEY is not configured. Set it in backend .env to enable travel web search.',
      };
    }

    const maxResults = params.maxResults ?? 6;
    const client = new OpenAI({ apiKey: this.apiKey });

    const preferredSites = params.includeDomains?.length
      ? `Prefer results from: ${params.includeDomains.join(', ')}.`
      : '';

    const system = [
      `You are ORBIT travel web search for ${params.kind}.`,
      'Use web search to find real booking pages that match the user request.',
      'Never invent URLs, hotels, airlines, or prices.',
      'Prefer exact listing/search result pages on booking sites (not homepage-only).',
      preferredSites,
      `Return at most ${maxResults} options.`,
      'Respond with JSON only (no markdown fences):',
      '{"summary":"short overview","results":[{"title":"...","url":"https://...","snippet":"why it fits","price":1234,"currency":"AED","stars":4,"airline":"Emirates","durationMinutes":420,"stops":0}]}',
      'Include price/stars for hotels and price/airline/durationMinutes/stops for flights when known from search. Omit unknown fields.',
    ]
      .filter(Boolean)
      .join(' ');

    const tool: OpenAI.Responses.Tool = {
      type: 'web_search',
    };

    try {
      const response = await client.responses.create({
        model: this.model,
        tools: [tool],
        tool_choice: 'required',
        include: ['web_search_call.action.sources'],
        input: [
          {
            role: 'system',
            content: system,
          },
          {
            role: 'user',
            content: params.query,
          },
        ],
      });

      const answer =
        typeof response.output_text === 'string'
          ? response.output_text
          : undefined;

      const fromJson = this.parseJsonResults(answer, maxResults);
      const fromCitations = this.extractCitationHits(response, maxResults);
      const fromSources = this.extractSourceHits(response, maxResults);

      const merged = this.mergeHits(
        [...fromJson, ...fromCitations, ...fromSources],
        maxResults,
      );

      if (!merged.length && !answer) {
        return {
          ok: false,
          results: [],
          error: 'OpenAI web search returned no booking links',
        };
      }

      return {
        ok: true,
        answer: fromJson.length
          ? this.safeSummary(answer) || answer
          : answer,
        results: merged,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Travel search failed';
      this.logger.warn(`OpenAI web search failed: ${message}`);
      return { ok: false, results: [], error: message };
    }
  }

  searchHotels(params: {
    destination: string;
    checkIn?: string;
    checkOut?: string;
    budget?: number;
    currency?: string;
    stars?: number;
    adults?: number;
  }) {
    const parts = [
      `Find bookable hotels in ${params.destination}`,
      params.checkIn && params.checkOut
        ? `check-in ${params.checkIn} check-out ${params.checkOut}`
        : null,
      params.budget
        ? `budget under ${params.budget} ${params.currency || 'AED'}`
        : null,
      params.stars ? `${params.stars} star preferred` : null,
      params.adults ? `${params.adults} adults` : null,
      'Return direct booking/listing page URLs',
    ].filter(Boolean);

    return this.search({
      query: parts.join('. '),
      maxResults: 6,
      kind: 'hotels',
      includeDomains: [
        'booking.com',
        'hotels.com',
        'expedia.com',
        'agoda.com',
        'tripadvisor.com',
      ],
    });
  }

  searchFlights(params: {
    origin: string;
    destination: string;
    departDate?: string;
    returnDate?: string;
    budget?: number;
    currency?: string;
    cabin?: string;
    adults?: number;
    airline?: string;
  }) {
    const parts = [
      `Find bookable flights from ${params.origin} to ${params.destination}`,
      params.departDate ? `departing ${params.departDate}` : null,
      params.returnDate ? `returning ${params.returnDate}` : null,
      params.budget
        ? `budget under ${params.budget} ${params.currency || 'AED'}`
        : null,
      params.cabin ? `${params.cabin} cabin` : null,
      params.adults ? `${params.adults} adults` : null,
      params.airline ? `prefer airline ${params.airline}` : null,
      'Return direct flight search or airline booking page URLs',
    ].filter(Boolean);

    return this.search({
      query: parts.join('. '),
      maxResults: 6,
      kind: 'flights',
      includeDomains: [
        'google.com',
        'kayak.com',
        'skyscanner.com',
        'expedia.com',
        'emirates.com',
        'etihad.com',
        'flydubai.com',
      ],
    });
  }

  private parseJsonResults(
    text: string | undefined,
    maxResults: number,
  ): TravelSearchHit[] {
    if (!text) return [];
    const jsonText = this.extractJsonObject(text);
    if (!jsonText) return [];

    try {
      const parsed = JSON.parse(jsonText) as {
        results?: Array<{
          title?: string;
          url?: string;
          snippet?: string;
          price?: number;
          currency?: string;
          stars?: number;
          airline?: string;
          durationMinutes?: number;
          stops?: number;
        }>;
      };
      return (parsed.results ?? [])
        .filter((r) => r.url && r.title)
        .slice(0, maxResults)
        .map((r) => ({
          title: r.title!,
          url: r.url!,
          content: (r.snippet || '').slice(0, 500),
          price: typeof r.price === 'number' ? r.price : undefined,
          currency: r.currency,
          stars: typeof r.stars === 'number' ? r.stars : undefined,
          airline: r.airline,
          durationMinutes:
            typeof r.durationMinutes === 'number'
              ? r.durationMinutes
              : undefined,
          stops: typeof r.stops === 'number' ? r.stops : undefined,
        }));
    } catch {
      return [];
    }
  }

  private extractJsonObject(text: string): string | null {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1]?.trim() || text.trim();
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    return candidate.slice(start, end + 1);
  }

  private safeSummary(text: string | undefined): string | undefined {
    if (!text) return undefined;
    const jsonText = this.extractJsonObject(text);
    if (!jsonText) return text;
    try {
      const parsed = JSON.parse(jsonText) as { summary?: string };
      return parsed.summary || text;
    } catch {
      return text;
    }
  }

  private extractCitationHits(
    response: OpenAI.Responses.Response,
    maxResults: number,
  ): TravelSearchHit[] {
    const hits: TravelSearchHit[] = [];
    for (const item of response.output ?? []) {
      if (item.type !== 'message') continue;
      for (const part of item.content ?? []) {
        if (part.type !== 'output_text') continue;
        for (const ann of part.annotations ?? []) {
          if (ann.type !== 'url_citation' || !ann.url) continue;
          hits.push({
            title: ann.title || ann.url,
            url: ann.url,
            content: '',
          });
        }
      }
    }
    return hits.slice(0, maxResults);
  }

  private extractSourceHits(
    response: OpenAI.Responses.Response,
    maxResults: number,
  ): TravelSearchHit[] {
    const hits: TravelSearchHit[] = [];
    for (const item of response.output ?? []) {
      if (item.type !== 'web_search_call') continue;
      const action = item.action as
        | { type?: string; sources?: Array<{ url?: string; title?: string }> }
        | undefined;
      if (!action?.sources?.length) continue;
      for (const src of action.sources) {
        if (!src.url) continue;
        hits.push({
          title: src.title || src.url,
          url: src.url,
          content: '',
        });
      }
    }
    return hits.slice(0, maxResults);
  }

  private mergeHits(hits: TravelSearchHit[], maxResults: number) {
    const seen = new Set<string>();
    const out: TravelSearchHit[] = [];
    for (const hit of hits) {
      const key = hit.url.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(hit);
      if (out.length >= maxResults) break;
    }
    return out;
  }
}

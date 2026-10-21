import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { assertChatOpenAiAllowed } from '../ai/openai-chat-scope';
import {
  HOTEL_OTA_DOMAINS,
  HOTEL_SECONDARY_DOMAINS,
  hotelOtaSearchHint,
  resolveHotelProvider,
} from './travel-ota';

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
  /** Friendly OTA name when known (hotels) */
  provider?: string;
  /** Always true for ORBIT travel links — book on partner site */
  external?: boolean;
};

type SearchOutcome = {
  ok: boolean;
  answer?: string;
  results: TravelSearchHit[];
  error?: string;
};

export type TravelDeal = {
  title: string;
  code: string | null;
  scope: 'hotel' | 'flight' | 'package' | 'other';
  terms: string | null;
  validUntil: string | null;
  sourceUrl: string;
  provider: string;
  estimatedSaving: string | null;
  currency: string | null;
  external: true;
};

export type TravelDealsOutcome = {
  ok: boolean;
  summary: string | null;
  deals: TravelDeal[];
  error?: string;
  disclaimer: string;
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

    const hotelExtra =
      params.kind === 'hotels'
        ? [
            hotelOtaSearchHint(),
            'Cover multiple platforms when possible (Booking.com, Agoda, Hotels.com, Expedia, Kayak).',
            'Mark that booking happens on the partner website (external redirect).',
          ].join(' ')
        : '';

    const system = [
      `You are ORBIT travel web search for ${params.kind}.`,
      'Use web search ONLY. Be literal — do not invent or guess.',
      'Never invent URLs, hotels, airlines, prices, or providers.',
      'If search finds nothing real, return {"summary":"No verified results","results":[]}.',
      'Omit price/stars/airline fields when not clearly present in search (do not fabricate numbers).',
      'Prefer exact listing/search result pages on booking sites (not homepage-only).',
      preferredSites,
      hotelExtra,
      `Return at most ${maxResults} options.`,
      'Respond with JSON only (no markdown fences):',
      '{"summary":"short overview","results":[{"title":"...","url":"https://...","snippet":"why it fits","price":1234,"currency":"AED","stars":4,"airline":"Emirates","durationMinutes":420,"stops":0,"provider":"Booking.com"}]}',
      'Include price/stars for hotels and price/airline/durationMinutes/stops for flights ONLY when known from search.',
      'For hotels, set provider to the OTA name when known. Prices are estimates only.',
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

      let merged = this.mergeHits(
        [...fromJson, ...fromCitations, ...fromSources],
        maxResults * 2,
      );

      if (params.kind === 'hotels') {
        merged = this.enrichAndPreferHotelOtas(merged, maxResults);
      } else {
        merged = merged.slice(0, maxResults);
      }

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
      'Return direct booking/listing page URLs on international OTAs',
      hotelOtaSearchHint(),
    ].filter(Boolean);

    return this.search({
      query: parts.join('. '),
      maxResults: 8,
      kind: 'hotels',
      includeDomains: [...HOTEL_OTA_DOMAINS, ...HOTEL_SECONDARY_DOMAINS],
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

  /**
   * Chat-only web search for discount coupons / travel promo offers.
   * Never invents coupon codes — empty list if none found.
   */
  async searchTravelDeals(params: {
    query: string;
    destination?: string;
    scope?: 'hotel' | 'flight' | 'package' | 'any';
    maxResults?: number;
  }): Promise<TravelDealsOutcome> {
    const disclaimer =
      'Deals and coupon codes change often. Verify on the partner site before booking. ORBIT does not apply codes or process payment — links are external.';

    try {
      assertChatOpenAiAllowed('travel-search:deals');
    } catch (error) {
      return {
        ok: false,
        summary: null,
        deals: [],
        error: error instanceof Error ? error.message : String(error),
        disclaimer,
      };
    }

    if (!this.apiKey) {
      return {
        ok: false,
        summary: null,
        deals: [],
        error: 'OPENAI_API_KEY is not configured',
        disclaimer,
      };
    }

    const maxResults = params.maxResults ?? 6;
    const scope = params.scope || 'any';
    const client = new OpenAI({ apiKey: this.apiKey });

    const userQuery = [
      params.query,
      params.destination ? `Destination/focus: ${params.destination}` : null,
      scope !== 'any' ? `Focus on ${scope} deals` : null,
      'Find current travel discount coupons, promo codes, and special offers.',
    ]
      .filter(Boolean)
      .join('. ');

    const system = [
      'You are ORBIT travel deals / coupon search.',
      'Use web search ONLY. Be literal and conservative.',
      'HARD RULES:',
      '- Do NOT invent, guess, or fabricate coupon codes, URLs, savings, expiry dates, or terms.',
      '- Do NOT use memory or "typical" promos. Only what web search actually returns.',
      '- If the page does not clearly show a coupon code, set code to null (do not invent one).',
      '- If nothing real is found, return {"summary":"No verified deals found","deals":[]}.',
      '- Every deal MUST have a real https sourceUrl from search results.',
      'Prefer: Booking.com, Agoda, Hotels.com, Expedia, Kayak, major airlines, reputable deal pages.',
      `Return at most ${maxResults} deals.`,
      'Respond with JSON only (no markdown fences):',
      '{"summary":"short overview","deals":[{"title":"...","code":null,"scope":"hotel|flight|package|other","terms":null,"validUntil":null,"sourceUrl":"https://...","provider":"Booking.com","estimatedSaving":null,"currency":null}]}',
    ].join(' ');

    try {
      const response = await client.responses.create({
        model: this.model,
        tools: [{ type: 'web_search' }],
        tool_choice: 'required',
        include: ['web_search_call.action.sources'],
        input: [
          { role: 'system', content: system },
          { role: 'user', content: userQuery },
        ],
      });

      const answer =
        typeof response.output_text === 'string'
          ? response.output_text
          : undefined;

      const parsed = this.parseDealsJson(answer, maxResults);
      let deals = parsed.deals;

      if (!deals.length) {
        // Fall back to citation URLs as “offer pages” without inventing codes
        deals = this.dealsFromCitations(response, maxResults);
      }

      return {
        ok: true,
        summary: parsed.summary,
        deals,
        disclaimer,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Travel deals search failed';
      this.logger.warn(`Travel deals search failed: ${message}`);
      return {
        ok: false,
        summary: null,
        deals: [],
        error: message,
        disclaimer,
      };
    }
  }

  private parseDealsJson(
    text: string | undefined,
    maxResults: number,
  ): { summary: string | null; deals: TravelDeal[] } {
    if (!text) return { summary: null, deals: [] };
    const jsonText = this.extractJsonObject(text);
    if (!jsonText) return { summary: null, deals: [] };

    try {
      const parsed = JSON.parse(jsonText) as {
        summary?: string;
        deals?: Array<{
          title?: string;
          code?: string | null;
          scope?: string;
          terms?: string | null;
          validUntil?: string | null;
          sourceUrl?: string;
          provider?: string;
          estimatedSaving?: string | null;
          currency?: string | null;
        }>;
      };

      const deals: TravelDeal[] = (parsed.deals ?? [])
        .filter((d) => {
          const url = (d.sourceUrl || '').trim();
          return (
            Boolean(d.title?.trim()) &&
            /^https:\/\//i.test(url) &&
            !/example\.com|placeholder|your-link/i.test(url)
          );
        })
        .slice(0, maxResults)
        .map((d) => {
          const url = d.sourceUrl!.trim();
          const info = resolveHotelProvider(url);
          const scopeRaw = (d.scope || 'other').toLowerCase();
          const scope: TravelDeal['scope'] =
            scopeRaw === 'hotel' ||
            scopeRaw === 'flight' ||
            scopeRaw === 'package'
              ? scopeRaw
              : 'other';
          // Drop codes that look fabricated / generic placeholders
          let code =
            typeof d.code === 'string' && d.code.trim()
              ? d.code.trim()
              : null;
          if (
            code &&
            /^(null|n\/a|none|todo|xxx|test|sample|example|promo|code)$/i.test(
              code,
            )
          ) {
            code = null;
          }
          return {
            title: d.title!.trim(),
            code,
            scope,
            terms: d.terms?.trim() || null,
            validUntil: d.validUntil?.trim() || null,
            sourceUrl: url,
            provider: d.provider?.trim() || info.provider,
            estimatedSaving: d.estimatedSaving?.trim() || null,
            currency: d.currency?.trim() || null,
            external: true as const,
          };
        });

      return {
        summary: parsed.summary?.trim() || null,
        deals,
      };
    } catch {
      return { summary: null, deals: [] };
    }
  }

  private dealsFromCitations(
    response: OpenAI.Responses.Response,
    maxResults: number,
  ): TravelDeal[] {
    const out: TravelDeal[] = [];
    const seen = new Set<string>();

    const push = (title: string, url: string) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      const info = resolveHotelProvider(url);
      out.push({
        title: title || info.provider,
        code: null,
        scope: 'other',
        terms: 'Open the partner page to see current offers (no code confirmed).',
        validUntil: null,
        sourceUrl: url,
        provider: info.provider,
        estimatedSaving: null,
        currency: null,
        external: true,
      });
    };

    for (const item of response.output ?? []) {
      if (item.type === 'web_search_call') {
        const action = item.action as
          | { sources?: Array<{ url?: string; title?: string }> }
          | undefined;
        for (const s of action?.sources ?? []) {
          if (s.url) push(s.title || s.url, s.url);
          if (out.length >= maxResults) return out;
        }
      }
      if (item.type === 'message') {
        for (const part of item.content ?? []) {
          if (part.type !== 'output_text') continue;
          for (const ann of part.annotations ?? []) {
            if (ann.type === 'url_citation' && ann.url) {
              push(ann.title || ann.url, ann.url);
              if (out.length >= maxResults) return out;
            }
          }
        }
      }
    }
    return out.slice(0, maxResults);
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
          provider?: string;
        }>;
      };
      return (parsed.results ?? [])
        .filter((r) => r.url && r.title)
        .slice(0, maxResults)
        .map((r) => {
          const info = resolveHotelProvider(r.url!);
          return {
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
            provider: r.provider || info.provider,
            external: true as const,
          };
        });
    } catch {
      return [];
    }
  }

  /**
   * Tag providers, prefer major OTAs, keep some secondary if needed.
   */
  private enrichAndPreferHotelOtas(
    hits: TravelSearchHit[],
    maxResults: number,
  ): TravelSearchHit[] {
    type Ranked = TravelSearchHit & { major: boolean; known: boolean };
    const enriched: Ranked[] = hits.map((hit) => {
      const info = resolveHotelProvider(hit.url);
      return {
        ...hit,
        provider: hit.provider || info.provider,
        external: true,
        major: info.isMajorOta,
        known: info.isKnownHotelSite,
      };
    });

    const major = enriched.filter((h) => h.major);
    const known = enriched.filter((h) => !h.major && h.known);
    const other = enriched.filter((h) => !h.major && !h.known);

    return [...major, ...known, ...other].slice(0, maxResults).map((h) => {
      const { major: _m, known: _k, ...hit } = h;
      return hit;
    });
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

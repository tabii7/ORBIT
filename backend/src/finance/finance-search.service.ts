import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { assertChatOpenAiAllowed } from '../ai/openai-chat-scope';

export type FinanceQuote = {
  symbol: string;
  price?: number;
  currency?: string;
  changePercent?: number;
  market?: string;
  asOf?: string;
  sourceUrl?: string;
  note?: string;
};

export type FinanceNewsItem = {
  title: string;
  url: string;
  snippet: string;
};

export type FinanceSource = { title: string; url: string };

export type ShariaStatus = 'HALAL' | 'HARAM' | 'MIXED' | 'UNKNOWN';

export type ShariaScreenResult = {
  symbol: string;
  status: ShariaStatus;
  criteria: string[];
  notes: string | null;
  sources: FinanceSource[];
  disclaimer: string;
};

type SearchOutcome<T> = {
  ok: boolean;
  answer?: string;
  data?: T;
  error?: string;
  sources?: FinanceSource[];
};

const SHARIA_DISCLAIMER =
  'Informational screening only — not a fatwa or religious ruling. Verify with a qualified scholar or dedicated Sharia screening provider. Status is UNKNOWN when sources are unclear.';

const ASSET_INSIGHT_DISCLAIMER =
  'Informational market overview only — not investment advice. No returns are guaranteed. Prices and trends change; verify with primary sources before any decision.';

export type AssetInsight = {
  asset: string;
  summary: string | null;
  priceNote: string | null;
  trends: string[];
  risks: string[];
  opportunities: string[];
  uncertainties: string[];
  sources: FinanceSource[];
  disclaimer: string;
};

/**
 * Live market quotes / news / highlights via OpenAI web_search.
 * ONLY when called under POST /api/chat (assertChatOpenAiAllowed).
 * Never from crons or background jobs.
 */
@Injectable()
export class FinanceSearchService {
  private readonly logger = new Logger(FinanceSearchService.name);

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

  async getQuote(symbol: string): Promise<SearchOutcome<FinanceQuote>> {
    const result = await this.webSearch(
      `Current live stock/index price for ${symbol}. Include currency, % change if available, and source URLs.`,
      'quote',
    );
    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        data: { symbol: symbol.toUpperCase(), note: result.error },
        sources: result.sources,
      };
    }
    return {
      ok: true,
      answer: result.summary ?? undefined,
      data: {
        symbol: symbol.toUpperCase(),
        note: result.summary ?? undefined,
        sourceUrl: result.sources[0]?.url,
      },
      sources: result.sources,
    };
  }

  async getNews(
    query: string,
  ): Promise<SearchOutcome<{ items: FinanceNewsItem[]; summary?: string }>> {
    const result = await this.webSearch(
      `Latest market/stock news: ${query}. List key headlines with source links.`,
      'news',
    );
    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        data: { items: [] },
        sources: result.sources,
      };
    }
    const items: FinanceNewsItem[] = result.sources.map((s) => ({
      title: s.title,
      url: s.url,
      snippet: s.title,
    }));
    return {
      ok: true,
      answer: result.summary ?? undefined,
      data: { items, summary: result.summary ?? undefined },
      sources: result.sources,
    };
  }

  async research(
    query: string,
  ): Promise<SearchOutcome<{ summary: string }>> {
    const result = await this.webSearch(query, 'research');
    if (!result.ok) {
      return { ok: false, error: result.error, sources: result.sources };
    }
    return {
      ok: true,
      answer: result.summary ?? undefined,
      data: { summary: result.summary || '' },
      sources: result.sources,
    };
  }

  /**
   * General live market lookup (quotes, indices, FX, highlights, news).
   * Chat-only.
   */
  async searchMarket(query: string): Promise<{
    ok: boolean;
    summary: string | null;
    sources: FinanceSource[];
    error?: string;
  }> {
    return this.webSearch(query, 'market');
  }

  /**
   * Chat-only insights for assets like Bitcoin, gold, lithium.
   * Web search only — never invent prices or guarantee returns.
   */
  async analyzeAsset(asset: string): Promise<{
    ok: boolean;
    data: AssetInsight;
    error?: string;
  }> {
    const name = asset.trim();
    const empty = (error?: string) => ({
      ok: !error,
      error,
      data: {
        asset: name,
        summary: null,
        priceNote: null,
        trends: [] as string[],
        risks: [] as string[],
        opportunities: [] as string[],
        uncertainties: [] as string[],
        sources: [] as FinanceSource[],
        disclaimer: ASSET_INSIGHT_DISCLAIMER,
      },
    });

    try {
      assertChatOpenAiAllowed('finance-search:asset-insight');
    } catch (error) {
      return empty(error instanceof Error ? error.message : String(error));
    }

    if (!this.apiKey) {
      return empty('OPENAI_API_KEY is not configured');
    }

    const client = new OpenAI({ apiKey: this.apiKey });
    const system = [
      'You are ORBIT market insights assistant for commodities/crypto/materials.',
      'Use web search ONLY. Be literal — do not invent prices, forecasts, or guarantees.',
      'HARD RULES:',
      '- Never promise or imply guaranteed investment returns.',
      '- If price/trend is unclear, say so in uncertainties — do not guess numbers.',
      '- Every source URL must be real https from search.',
      '- Informational only — not investment advice.',
      'Respond with JSON only (no markdown fences):',
      '{"asset":"Bitcoin","summary":"...","priceNote":"current level from sources or null","trends":["..."],"risks":["..."],"opportunities":["..."],"uncertainties":["..."],"sources":[{"title":"...","url":"https://..."}]}',
    ].join(' ');

    const userQuery = [
      `Data-driven market insights for: ${name}.`,
      'Cover recent price context (if available), trends, risks, possible opportunities, and uncertainties.',
      'Prefer reputable financial/news sources. Do not invent figures.',
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

      const parsed = this.parseAssetInsightJson(answer, name);
      let sources = parsed.sources;
      if (!sources.length) {
        sources = this.extractSources(response)
          .filter((s) => /^https:\/\//i.test(s.url))
          .slice(0, 8);
      }

      return {
        ok: true,
        data: {
          ...parsed,
          sources,
          disclaimer: ASSET_INSIGHT_DISCLAIMER,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Asset insight failed for ${name}: ${message}`);
      return empty(message);
    }
  }

  private parseAssetInsightJson(
    text: string | undefined,
    fallbackAsset: string,
  ): Omit<AssetInsight, 'disclaimer'> {
    const blank = {
      asset: fallbackAsset,
      summary: null as string | null,
      priceNote: null as string | null,
      trends: [] as string[],
      risks: [] as string[],
      opportunities: [] as string[],
      uncertainties: [] as string[],
      sources: [] as FinanceSource[],
    };
    if (!text) return blank;
    try {
      const cleaned = text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start < 0 || end <= start) return blank;
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
        asset?: string;
        summary?: string;
        priceNote?: string | null;
        trends?: unknown;
        risks?: unknown;
        opportunities?: unknown;
        uncertainties?: unknown;
        sources?: Array<{ title?: string; url?: string }>;
      };
      const list = (v: unknown) =>
        Array.isArray(v)
          ? v
              .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
              .map((x) => x.trim())
              .slice(0, 8)
          : [];
      const sources = (parsed.sources ?? [])
        .filter(
          (s) =>
            s.url &&
            s.title &&
            /^https:\/\//i.test(s.url) &&
            !/example\.com|placeholder/i.test(s.url),
        )
        .map((s) => ({ title: s.title!, url: s.url! }))
        .slice(0, 8);
      return {
        asset: parsed.asset?.trim() || fallbackAsset,
        summary: parsed.summary?.trim() || null,
        priceNote: parsed.priceNote?.trim() || null,
        trends: list(parsed.trends),
        risks: list(parsed.risks),
        opportunities: list(parsed.opportunities),
        uncertainties: list(parsed.uncertainties),
        sources,
      };
    } catch {
      return blank;
    }
  }

  /**
   * Chat-only Sharia (Halal/Haram) stock screen via web search.
   * Never invents HALAL/HARAM — uses UNKNOWN when sources are unclear.
   */
  async screenShariaStock(symbol: string): Promise<{
    ok: boolean;
    data: ShariaScreenResult;
    error?: string;
  }> {
    const sym = symbol.trim().toUpperCase();
    const empty = (status: ShariaStatus, error?: string) => ({
      ok: !error,
      error,
      data: {
        symbol: sym,
        status,
        criteria: [] as string[],
        notes: error || null,
        sources: [] as FinanceSource[],
        disclaimer: SHARIA_DISCLAIMER,
      },
    });

    try {
      assertChatOpenAiAllowed('finance-search:sharia');
    } catch (error) {
      return empty(
        'UNKNOWN',
        error instanceof Error ? error.message : String(error),
      );
    }

    if (!this.apiKey) {
      return empty('UNKNOWN', 'OPENAI_API_KEY is not configured');
    }

    const client = new OpenAI({ apiKey: this.apiKey });
    const system = [
      'You are ORBIT Sharia stock screening assistant.',
      'Use web search ONLY. Be literal — do not invent classifications.',
      'Look up Islamic/Sharia stock screening for the given ticker from reputable public sources',
      '(e.g. Musaffa, Zoya, Islamicly, AAOIFI-related, DJIM/FTSE Shariah mentions, company business activity).',
      'HARD RULES:',
      '- Do NOT guess HALAL or HARAM from memory or general knowledge alone.',
      '- status must be one of: HALAL | HARAM | MIXED | UNKNOWN.',
      '- If sources conflict or are unclear → UNKNOWN.',
      '- If no reliable screening result is found → UNKNOWN with empty criteria.',
      '- Every source URL must be a real https link from search.',
      '- Informational only — not a fatwa.',
      'Respond with JSON only (no markdown fences):',
      '{"symbol":"AAPL","status":"UNKNOWN","criteria":["short bullet from sources only"],"notes":"optional short note or null","sources":[{"title":"...","url":"https://..."}]}',
    ].join(' ');

    const userQuery = [
      `Sharia / Islamic finance Halal vs Haram screening for stock ticker: ${sym}.`,
      'Report only what public screening sources say. If unclear, status=UNKNOWN.',
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

      const parsed = this.parseShariaJson(answer, sym);
      let sources = parsed.sources;
      if (!sources.length) {
        sources = this.extractSources(response)
          .filter((s) => /^https:\/\//i.test(s.url))
          .slice(0, 8);
      }

      // No reliable sources → force UNKNOWN (do not trust bare status claims)
      let status = parsed.status;
      if (!sources.length && status !== 'UNKNOWN') {
        status = 'UNKNOWN';
      }

      return {
        ok: true,
        data: {
          symbol: sym,
          status,
          criteria: parsed.criteria,
          notes: parsed.notes,
          sources,
          disclaimer: SHARIA_DISCLAIMER,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Sharia screen failed for ${sym}: ${message}`);
      return empty('UNKNOWN', message);
    }
  }

  private parseShariaJson(
    text: string | undefined,
    fallbackSymbol: string,
  ): {
    status: ShariaStatus;
    criteria: string[];
    notes: string | null;
    sources: FinanceSource[];
  } {
    if (!text) {
      return { status: 'UNKNOWN', criteria: [], notes: null, sources: [] };
    }
    try {
      const cleaned = text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start < 0 || end <= start) {
        return { status: 'UNKNOWN', criteria: [], notes: null, sources: [] };
      }
      const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
        status?: string;
        criteria?: unknown;
        notes?: string | null;
        sources?: Array<{ title?: string; url?: string }>;
      };

      const raw = (parsed.status || 'UNKNOWN').toUpperCase();
      const status: ShariaStatus =
        raw === 'HALAL' ||
        raw === 'HARAM' ||
        raw === 'MIXED' ||
        raw === 'UNKNOWN'
          ? raw
          : 'UNKNOWN';

      const criteria = Array.isArray(parsed.criteria)
        ? parsed.criteria
            .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
            .map((c) => c.trim())
            .slice(0, 12)
        : [];

      const sources = (parsed.sources ?? [])
        .filter(
          (s) =>
            s.url &&
            s.title &&
            /^https:\/\//i.test(s.url) &&
            !/example\.com|placeholder/i.test(s.url),
        )
        .map((s) => ({ title: s.title!, url: s.url! }))
        .slice(0, 8);

      void fallbackSymbol;
      return {
        status,
        criteria,
        notes: parsed.notes?.trim() || null,
        sources,
      };
    } catch {
      return { status: 'UNKNOWN', criteria: [], notes: null, sources: [] };
    }
  }

  private async webSearch(
    query: string,
    kind: string,
  ): Promise<{
    ok: boolean;
    summary: string | null;
    sources: FinanceSource[];
    error?: string;
  }> {
    try {
      assertChatOpenAiAllowed(`finance-search:${kind}`);
    } catch (error) {
      return {
        ok: false,
        summary: null,
        sources: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }

    if (!this.apiKey) {
      return {
        ok: false,
        summary: null,
        sources: [],
        error: 'OPENAI_API_KEY is not configured',
      };
    }

    const client = new OpenAI({ apiKey: this.apiKey });
    const system = [
      'You are ORBIT finance web search.',
      'Use web search for live market prices, indices, FX, stock highlights, and financial news.',
      'Never invent prices, headlines, or URLs. Prefer recent reputable sources.',
      'Informational only — not investment advice.',
      'Respond with JSON only (no markdown fences):',
      '{"summary":"markdown with key figures and bullet highlights","sources":[{"title":"...","url":"https://..."}]}',
    ].join(' ');

    try {
      const response = await client.responses.create({
        model: this.model,
        tools: [{ type: 'web_search' }],
        tool_choice: 'required',
        include: ['web_search_call.action.sources'],
        input: [
          { role: 'system', content: system },
          { role: 'user', content: query },
        ],
      });

      const answer =
        typeof response.output_text === 'string'
          ? response.output_text
          : undefined;

      let summary = answer || '';
      let sources: FinanceSource[] = [];
      try {
        const cleaned = (answer || '')
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/i, '')
          .trim();
        const parsed = JSON.parse(cleaned) as {
          summary?: string;
          sources?: Array<{ title?: string; url?: string }>;
        };
        summary = parsed.summary || summary;
        sources = (parsed.sources ?? [])
          .filter((s) => s.url && s.title)
          .map((s) => ({ title: s.title!, url: s.url! }))
          .slice(0, 10);
      } catch {
        // keep raw answer; try citation sources from response
        sources = this.extractSources(response).slice(0, 10);
      }

      if (!sources.length) {
        sources = this.extractSources(response).slice(0, 10);
      }

      if (!summary && !sources.length) {
        return {
          ok: false,
          summary: null,
          sources: [],
          error: 'Web search returned no market data',
        };
      }

      return { ok: true, summary: summary || null, sources };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Finance web search failed (${kind}): ${message}`);
      return { ok: false, summary: null, sources: [], error: message };
    }
  }

  private extractSources(response: OpenAI.Responses.Response): FinanceSource[] {
    const out: FinanceSource[] = [];
    const seen = new Set<string>();
    for (const item of response.output ?? []) {
      if (!item || typeof item !== 'object') continue;
      const anyItem = item as {
        type?: string;
        action?: { sources?: Array<{ title?: string; url?: string }> };
      };
      if (anyItem.type !== 'web_search_call') continue;
      for (const s of anyItem.action?.sources ?? []) {
        if (!s.url || seen.has(s.url)) continue;
        seen.add(s.url);
        out.push({ title: s.title || s.url, url: s.url });
      }
    }
    return out;
  }
}

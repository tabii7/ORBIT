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

type SearchOutcome<T> = {
  ok: boolean;
  answer?: string;
  data?: T;
  error?: string;
  sources?: FinanceSource[];
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

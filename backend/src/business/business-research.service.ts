import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BusinessNoteKind } from '@prisma/client';
import OpenAI from 'openai';
import { assertChatOpenAiAllowed } from '../ai/openai-chat-scope';
import { BusinessNotesService } from './business-notes.service';

@Injectable()
export class BusinessResearchService {
  private readonly logger = new Logger(BusinessResearchService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly businessNotesService: BusinessNotesService,
  ) {}

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

  async research(
    userId: string,
    query: string,
    opts?: { saveNote?: boolean; title?: string },
  ) {
    try {
      assertChatOpenAiAllowed('business-research');
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        summary: null,
        sources: [] as Array<{ title: string; url: string }>,
      };
    }

    if (!this.apiKey) {
      return {
        ok: false,
        error: 'OPENAI_API_KEY is not configured',
        summary: null,
        sources: [] as Array<{ title: string; url: string }>,
      };
    }

    const client = new OpenAI({ apiKey: this.apiKey });
    const system = [
      'You are ORBIT business research assistant.',
      'Use web search. Never invent URLs or statistics.',
      'Informational only — not legal, tax, or investment advice.',
      'Respond with JSON only (no markdown fences):',
      '{"summary":"markdown overview","sources":[{"title":"...","url":"https://..."}]}',
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
      let sources: Array<{ title: string; url: string }> = [];
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
          .slice(0, 8);
      } catch {
        // keep raw answer
      }

      let note = null as Awaited<
        ReturnType<BusinessNotesService['create']>
      > | null;
      if (opts?.saveNote !== false && summary) {
        note = await this.businessNotesService.create(userId, {
          title: opts?.title || `Research: ${query.slice(0, 80)}`,
          body: summary,
          kind: BusinessNoteKind.RESEARCH,
          sourceUrls: sources.map((s) => s.url),
          tags: ['research'],
        });
      }

      return { ok: true, summary, sources, note, query };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Business research failed: ${message}`);
      return {
        ok: false,
        error: message,
        summary: null,
        sources: [] as Array<{ title: string; url: string }>,
      };
    }
  }
}

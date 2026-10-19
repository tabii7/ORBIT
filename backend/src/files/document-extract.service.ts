import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { assertChatOpenAiAllowed } from '../ai/openai-chat-scope';

export type ExtractResult = {
  text: string | null;
  status: 'READY' | 'FAILED' | 'SKIPPED';
  error?: string;
  method?: 'pdf-parse' | 'text' | 'vision' | 'none';
};

/**
 * Extracts text from chat uploads.
 * Text PDFs/TXT: local parse (no OpenAI).
 * Images / scanned PDFs: OpenAI vision — only when called inside POST /api/chat scope.
 */
@Injectable()
export class DocumentExtractService {
  private readonly logger = new Logger(DocumentExtractService.name);

  constructor(private readonly config: ConfigService) {}

  private get apiKey() {
    return this.config.get<string>('OPENAI_API_KEY') || '';
  }

  private get visionModel() {
    return (
      this.config.get<string>('OPENAI_VISION_MODEL') ||
      this.config.get<string>('OPENAI_MODEL') ||
      'gpt-4o-mini'
    );
  }

  async extractText(params: {
    buffer: Buffer;
    mimeType: string;
    originalName: string;
  }): Promise<ExtractResult> {
    const mime = params.mimeType.toLowerCase();
    const name = params.originalName.toLowerCase();

    if (mime.includes('pdf') || name.endsWith('.pdf')) {
      const local = await this.extractPdfLocal(params.buffer);
      if (local.text) return { ...local, method: 'pdf-parse' };
      return this.extractWithVision({
        buffer: params.buffer,
        mimeType: 'application/pdf',
        originalName: params.originalName,
        kind: 'pdf',
        fallbackError: local.error,
      });
    }

    if (
      mime.startsWith('text/') ||
      name.endsWith('.txt') ||
      name.endsWith('.md') ||
      name.endsWith('.csv')
    ) {
      const text = params.buffer.toString('utf8').trim();
      return {
        text: text ? text.slice(0, 50_000) : null,
        status: text ? 'READY' : 'FAILED',
        error: text ? undefined : 'Empty text file',
        method: 'text',
      };
    }

    const isImage =
      mime.startsWith('image/') ||
      /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(name);
    if (isImage) {
      const visionMime = mime.startsWith('image/')
        ? params.mimeType
        : name.endsWith('.png')
          ? 'image/png'
          : name.endsWith('.webp')
            ? 'image/webp'
            : name.endsWith('.gif')
              ? 'image/gif'
              : 'image/jpeg';
      return this.extractWithVision({
        buffer: params.buffer,
        mimeType: visionMime,
        originalName: params.originalName,
        kind: 'image',
      });
    }

    // doc/docx — no local parser yet; try vision/file path as best effort
    if (
      name.endsWith('.doc') ||
      name.endsWith('.docx') ||
      mime.includes('word')
    ) {
      return this.extractWithVision({
        buffer: params.buffer,
        mimeType: params.mimeType || 'application/octet-stream',
        originalName: params.originalName,
        kind: 'file',
      });
    }

    return {
      text: null,
      status: 'SKIPPED',
      error: `Unsupported extract type: ${params.mimeType}`,
      method: 'none',
    };
  }

  private async extractPdfLocal(
    buffer: Buffer,
  ): Promise<ExtractResult> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse');
      const parser = pdfParse.default || pdfParse;
      const result = await parser(buffer);
      const text = String(result?.text || '').trim();
      if (!text) {
        return {
          text: null,
          status: 'FAILED',
          error: 'PDF contained no extractable text (may be scanned)',
        };
      }
      return {
        text:
          text.length > 50_000
            ? `${text.slice(0, 50_000)}\n\n[truncated]`
            : text,
        status: 'READY',
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'PDF extract failed';
      this.logger.warn(`PDF extract failed: ${message}`);
      return { text: null, status: 'FAILED', error: message };
    }
  }

  private async extractWithVision(params: {
    buffer: Buffer;
    mimeType: string;
    originalName: string;
    kind: 'image' | 'pdf' | 'file';
    fallbackError?: string;
  }): Promise<ExtractResult> {
    try {
      assertChatOpenAiAllowed('document-extract-vision');
    } catch (error) {
      return {
        text: null,
        status: 'FAILED',
        error: error instanceof Error ? error.message : String(error),
        method: 'vision',
      };
    }

    if (!this.apiKey) {
      return {
        text: null,
        status: 'FAILED',
        error: 'OPENAI_API_KEY is not configured for document vision extract',
        method: 'vision',
      };
    }

    // Cap size to limit cost (~6MB raw)
    if (params.buffer.byteLength > 6 * 1024 * 1024) {
      return {
        text: null,
        status: 'FAILED',
        error: 'File too large for vision extract (max 6MB). Try a clearer crop or text PDF.',
        method: 'vision',
      };
    }

    const client = new OpenAI({ apiKey: this.apiKey });
    const b64 = params.buffer.toString('base64');
    const instruction = [
      'Extract all readable text from this document/image.',
      'Preserve structure: headings, labels, values, dates, tables as markdown when possible.',
      'If medical/lab/prescription, keep numbers and units exact.',
      'If unreadable, say so briefly. Do not invent content.',
      'Return plain text / markdown only — no preamble.',
    ].join(' ');

    try {
      let text: string | undefined;

      if (params.kind === 'image') {
        const completion = await client.chat.completions.create({
          model: this.visionModel,
          temperature: 0,
          max_tokens: 4000,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: instruction },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${params.mimeType};base64,${b64}`,
                  },
                },
              ],
            },
          ],
        });
        text = completion.choices[0]?.message?.content?.trim();
      } else {
        // Scanned PDF / office file via Responses file input
        const response = await client.responses.create({
          model: this.visionModel,
          temperature: 0,
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_file',
                  filename: params.originalName || 'document.pdf',
                  file_data: `data:${params.mimeType};base64,${b64}`,
                } as never,
                { type: 'input_text', text: instruction },
              ],
            },
          ],
        });
        text =
          typeof response.output_text === 'string'
            ? response.output_text.trim()
            : undefined;
      }

      if (!text) {
        return {
          text: null,
          status: 'FAILED',
          error:
            params.fallbackError ||
            'Vision extract returned empty text',
          method: 'vision',
        };
      }

      const capped =
        text.length > 50_000
          ? `${text.slice(0, 50_000)}\n\n[truncated]`
          : text;

      this.logger.log(
        `Vision extract ok file=${params.originalName} chars=${capped.length}`,
      );
      return { text: capped, status: 'READY', method: 'vision' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Vision extract failed file=${params.originalName}: ${message}`,
      );
      return {
        text: null,
        status: 'FAILED',
        error: message,
        method: 'vision',
      };
    }
  }
}

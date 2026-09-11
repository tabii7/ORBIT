import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class DocumentExtractService {
  private readonly logger = new Logger(DocumentExtractService.name);

  async extractText(params: {
    buffer: Buffer;
    mimeType: string;
    originalName: string;
  }): Promise<{ text: string | null; status: 'READY' | 'FAILED' | 'SKIPPED'; error?: string }> {
    const mime = params.mimeType.toLowerCase();
    const name = params.originalName.toLowerCase();

    if (
      mime.includes('pdf') ||
      name.endsWith('.pdf')
    ) {
      try {
        // pdf-parse v1/v2 interop
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse');
        const parser = pdfParse.default || pdfParse;
        const result = await parser(params.buffer);
        const text = String(result?.text || '').trim();
        if (!text) {
          return {
            text: null,
            status: 'FAILED',
            error: 'PDF contained no extractable text (may be scanned)',
          };
        }
        // Cap to keep prompts reasonable
        const capped =
          text.length > 50_000 ? `${text.slice(0, 50_000)}\n\n[truncated]` : text;
        return { text: capped, status: 'READY' };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'PDF extract failed';
        this.logger.warn(`PDF extract failed: ${message}`);
        return { text: null, status: 'FAILED', error: message };
      }
    }

    if (
      mime.startsWith('text/') ||
      name.endsWith('.txt') ||
      name.endsWith('.md') ||
      name.endsWith('.csv')
    ) {
      const text = params.buffer.toString('utf8').trim();
      return {
        text: text.slice(0, 50_000),
        status: text ? 'READY' : 'FAILED',
        error: text ? undefined : 'Empty text file',
      };
    }

    if (mime.startsWith('image/')) {
      return { text: null, status: 'SKIPPED' };
    }

    return {
      text: null,
      status: 'SKIPPED',
      error: `Unsupported extract type: ${params.mimeType}`,
    };
  }
}

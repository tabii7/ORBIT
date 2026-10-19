import type { ChatAttachmentInput } from './agent.types';

export function withAttachmentSystemPrompt(
  basePrompt: string,
  attachments: ChatAttachmentInput[] | undefined,
): string {
  const ctx = buildAttachmentContext(attachments);
  if (!ctx) return basePrompt;
  return (
    basePrompt +
    `\n\nAttachments on the latest user message:\n${ctx}` +
    '\n\nIf the user attached a document/image, READ the extracted text (and image if provided) and answer accordingly. Do not invent contents that are not in the attachment.'
  );
}

/** Shared attachment blurb for domain agent system prompts. */
export function buildAttachmentContext(
  attachments: ChatAttachmentInput[] | undefined,
  opts?: { maxCharsPerDoc?: number },
): string {
  if (!attachments?.length) return '';
  const max = opts?.maxCharsPerDoc ?? 12_000;

  return attachments
    .map((a, i) => {
      if (a.kind === 'DOCUMENT' || a.extractedText) {
        const text = a.extractedText
          ? a.extractedText.slice(0, max)
          : '(no extractable text yet — ask user to re-upload a clearer photo or text PDF)';
        return [
          `Attachment #${i + 1}: ${a.originalName} (${a.mimeType}) kind=${a.kind} status=${a.extractStatus ?? 'n/a'}`,
          a.healthDocumentId ? `healthDocumentId=${a.healthDocumentId}` : '',
          '--- extracted text start ---',
          text,
          '--- extracted text end ---',
        ]
          .filter(Boolean)
          .join('\n');
      }
      return `Attachment #${i + 1} IMAGE: ${a.originalName} (${a.mimeType}) — also provided as image input; read it and answer the user.`;
    })
    .join('\n\n');
}

export function attachmentRoutingHint(
  attachments: ChatAttachmentInput[] | undefined,
): string {
  if (!attachments?.length) return '';
  const names = attachments
    .map((a) => a.originalName || '')
    .join(' ')
    .toLowerCase();
  const blob = `${names} ${attachments.map((a) => a.extractedText?.slice(0, 500) || '').join(' ')}`.toLowerCase();

  if (
    /\b(invoice|proposal|contract|pitch|client|agreement|quotation|quote\s?#)\b/.test(
      blob,
    )
  ) {
    return 'BUSINESS';
  }
  if (
    /\b(boarding|eticket|e-ticket|flight|hotel|booking|itinerary|visa)\b/.test(
      blob,
    )
  ) {
    return 'TRAVEL';
  }
  if (
    /\b(receipt|expense|salary|payslip|bank\s*statement)\b/.test(blob) &&
    !/\b(lab|prescription|medical|clinic)\b/.test(blob)
  ) {
    return 'FINANCE';
  }
  if (
    /\b(lab|blood|prescription|rx|medical|clinic|hospital|x-?ray|mri|ultrasound|report|diagnosis|hbA1c|glucose)\b/.test(
      blob,
    )
  ) {
    return 'HEALTH';
  }
  // Default: health agent is the best general document reader today
  return 'HEALTH';
}

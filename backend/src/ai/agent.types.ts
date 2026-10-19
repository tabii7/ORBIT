export type AgentDomain =
  | 'HEALTH'
  | 'TRAVEL'
  | 'FINANCE'
  | 'PRODUCTIVITY'
  | 'BUSINESS';

export type ChatHistoryItem = {
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
};

export type ChatAttachmentInput = {
  kind: 'IMAGE' | 'DOCUMENT';
  mimeType: string;
  originalName: string;
  base64?: string;
  extractedText?: string | null;
  extractStatus?: string;
  publicUrl?: string;
  healthDocumentId?: string;
};

export type AgentChatParams = {
  userId: string;
  userMessage: string;
  history: ChatHistoryItem[];
  conversationType?: string;
  attachments?: ChatAttachmentInput[];
};

export type AgentChatResult = {
  message: string;
  actions: Array<Record<string, unknown>>;
  model: string;
  /** Which domain agent produced this reply (or MAIN if merged). */
  agent?: 'MAIN' | AgentDomain;
  /** Domains the main router dispatched to (order preserved). */
  routedTo?: AgentDomain[];
};

import { AsyncLocalStorage } from 'async_hooks';

/**
 * OpenAI may only run inside a POST /api/chat request.
 * Background crons and direct REST must not call OpenAI.
 */
type OpenAiChatScope = { allowed: true };

const als = new AsyncLocalStorage<OpenAiChatScope>();

export function runWithChatOpenAi<T>(fn: () => Promise<T>): Promise<T> {
  return als.run({ allowed: true }, fn);
}

export function assertChatOpenAiAllowed(caller: string): void {
  if (als.getStore()?.allowed) return;
  throw new Error(
    `OpenAI blocked outside chat (${caller}). Only POST /api/chat may use OpenAI.`,
  );
}

export function isChatOpenAiAllowed(): boolean {
  return Boolean(als.getStore()?.allowed);
}

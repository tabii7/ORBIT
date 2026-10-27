/** Plan codes used in DB seed + checkout. */
export const PLAN_CODES = ['basic', 'plus', 'pro'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const DEFAULT_SIGNUP_BONUS_CREDITS = 20;
export const DEFAULT_CHAT_CREDIT_COST = 3;
export const DEFAULT_CHAT_ATTACHMENT_EXTRA = 2;

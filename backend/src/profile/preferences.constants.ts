/** Fixed preference categories — frontend must not invent new keys. */
export const PREFERENCE_CATEGORIES = [
  'travel',
  'food',
  'language',
  'finance',
] as const;

export type PreferenceCategory = (typeof PREFERENCE_CATEGORIES)[number];

export const PREFERENCE_CATEGORY_SET = new Set<string>(PREFERENCE_CATEGORIES);

export function emptyPreferences(): Record<PreferenceCategory, string[]> {
  return {
    travel: [],
    food: [],
    language: [],
    finance: [],
  };
}

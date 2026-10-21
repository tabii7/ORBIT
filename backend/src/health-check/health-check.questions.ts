/**
 * Fixed wellness health-check quiz (v1).
 * Not a medical diagnosis — lifestyle self-check only.
 */

export type HealthCheckOption = {
  value: string;
  label: string;
  /** Higher = healthier habit for this question */
  points: number;
};

export type HealthCheckQuestion = {
  id: string;
  prompt: string;
  options: HealthCheckOption[];
};

export const HEALTH_CHECK_VERSION = 'v1';

export const HEALTH_CHECK_DISCLAIMER =
  'This is a general wellness self-check, not a medical diagnosis. If you feel unwell, contact a qualified healthcare professional.';

export const HEALTH_CHECK_QUESTIONS: HealthCheckQuestion[] = [
  {
    id: 'sleep',
    prompt: 'How many hours of sleep do you usually get per night?',
    options: [
      { value: 'under_5', label: 'Less than 5 hours', points: 0 },
      { value: '5_6', label: '5–6 hours', points: 1 },
      { value: '7_8', label: '7–8 hours', points: 3 },
      { value: 'over_8', label: 'More than 8 hours', points: 2 },
    ],
  },
  {
    id: 'water',
    prompt: 'How much water do you usually drink each day?',
    options: [
      { value: 'rarely', label: 'Rarely / only when thirsty', points: 0 },
      { value: '1_3', label: 'About 1–3 glasses', points: 1 },
      { value: '4_6', label: 'About 4–6 glasses', points: 2 },
      { value: '7_plus', label: '7+ glasses / 2+ litres', points: 3 },
    ],
  },
  {
    id: 'activity',
    prompt: 'How often do you do physical activity (walk, exercise, sports)?',
    options: [
      { value: 'rarely', label: 'Rarely or never', points: 0 },
      { value: '1_2', label: '1–2 days per week', points: 1 },
      { value: '3_4', label: '3–4 days per week', points: 2 },
      { value: '5_plus', label: '5+ days per week', points: 3 },
    ],
  },
  {
    id: 'meals',
    prompt: 'How would you describe your usual meals?',
    options: [
      { value: 'irregular_junk', label: 'Irregular / mostly fast food', points: 0 },
      { value: 'mixed', label: 'Mixed — some healthy, some not', points: 1 },
      { value: 'mostly_balanced', label: 'Mostly balanced home meals', points: 2 },
      { value: 'balanced', label: 'Consistently balanced meals', points: 3 },
    ],
  },
  {
    id: 'stress',
    prompt: 'How often do you feel stressed or overwhelmed?',
    options: [
      { value: 'almost_always', label: 'Almost every day', points: 0 },
      { value: 'often', label: 'Several times a week', points: 1 },
      { value: 'sometimes', label: 'Sometimes', points: 2 },
      { value: 'rarely', label: 'Rarely', points: 3 },
    ],
  },
  {
    id: 'meds_routine',
    prompt: 'If you take medicines or supplements, how consistent is your routine?',
    options: [
      { value: 'not_applicable', label: 'I don’t take any', points: 3 },
      { value: 'often_miss', label: 'I often miss doses', points: 0 },
      { value: 'sometimes_miss', label: 'I sometimes miss doses', points: 1 },
      { value: 'mostly_on_time', label: 'I take them mostly on time', points: 2 },
      { value: 'always_on_time', label: 'I take them on time', points: 3 },
    ],
  },
];

export function maxPossibleScore(): number {
  return HEALTH_CHECK_QUESTIONS.reduce(
    (sum, q) => sum + Math.max(...q.options.map((o) => o.points)),
    0,
  );
}

import {
  WEEKLY_INTENTS,
  WEEKLY_INTENT_LABELS,
  WEEKLY_INTENT_LONG_MATCHING_RULE_COPY,
  WEEKLY_INTENT_MATCHING_RULE_COPY,
  isWeeklyIntent,
  weeklyIntentLabelsFor,
  type WeeklyIntent,
} from "@lilink/shared";

export {
  WEEKLY_INTENTS,
  WEEKLY_INTENT_LABELS,
  WEEKLY_INTENT_LONG_MATCHING_RULE_COPY,
  WEEKLY_INTENT_MATCHING_RULE_COPY,
  isWeeklyIntent,
  weeklyIntentLabelsFor,
};
export type { WeeklyIntent };

type WeeklyIntentVisual = {
  /** Glyph rendered inside the round badge on the option card. */
  glyph: string;
  /** Tailwind-style gradient applied to the active option (CSS gradient). */
  accentGradient: string;
  /** Solid accent color used for ring / shadow / chip. */
  accent: string;
};

export const WEEKLY_INTENT_VISUALS: Record<WeeklyIntent, WeeklyIntentVisual> = {
  FRIEND: {
    glyph: "F",
    accentGradient:
      "linear-gradient(135deg, #4f8cff 0%, #6bb1ff 50%, #8ecbff 100%)",
    accent: "#4f8cff",
  },
  DATE: {
    glyph: "D",
    accentGradient:
      "linear-gradient(135deg, #8b3a4a 0%, #b15c6a 55%, #d68a92 100%)",
    accent: "#8b3a4a",
  },
  BOTH: {
    glyph: "B",
    accentGradient:
      "linear-gradient(135deg, #8a64ff 0%, #b387ff 50%, #d6b6ff 100%)",
    accent: "#8a64ff",
  },
};

export function readWeeklyIntent(value: unknown): WeeklyIntent | null {
  return isWeeklyIntent(value) ? value : null;
}

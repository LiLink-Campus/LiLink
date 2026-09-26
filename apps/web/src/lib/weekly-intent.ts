import {
  WEEKLY_INTENTS,
  WEEKLY_INTENT_LABELS,
  type WeeklyIntent,
} from "@lilink/shared";

export { WEEKLY_INTENTS, WEEKLY_INTENT_LABELS };
export type { WeeklyIntent };

type WeeklyIntentVisual = {
  /** Glyph rendered inside the round badge on the option card. */
  glyph: string;
  /** Solid accent color used for ring / shadow / chip. */
  accent: string;
};

export const WEEKLY_INTENT_VISUALS: Record<WeeklyIntent, WeeklyIntentVisual> = {
  FRIEND: {
    glyph: "F",
    accent: "#4f8cff",
  },
  DATE: {
    glyph: "D",
    accent: "#8b3a4a",
  },
  BOTH: {
    glyph: "B",
    accent: "#8a64ff",
  },
};

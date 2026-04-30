/**
 * Weekly matching intent — stored per cycle participation rather than on the
 * user profile, so each round can preserve or override the previous value.
 *
 * Compatibility rule (intersection-based):
 *   FRIEND ↔ FRIEND  ✓        FRIEND ↔ DATE  ✗        FRIEND ↔ BOTH  ✓
 *   DATE   ↔ DATE    ✓        DATE   ↔ BOTH  ✓        BOTH   ↔ BOTH  ✓
 */

import { DEFAULT_LOCALE, type SupportedLocale } from "./locale";

export const WEEKLY_INTENTS = ["FRIEND", "DATE", "BOTH"] as const;
export type WeeklyIntent = (typeof WEEKLY_INTENTS)[number];

export type WeeklyIntentLabels = {
  primary: string;
  subtitle: string;
  description: string;
};

export const WEEKLY_INTENT_LABELS_BY_LOCALE: Record<
  SupportedLocale,
  Record<WeeklyIntent, WeeklyIntentLabels>
> = {
  "zh-CN": {
    FRIEND: {
      primary: "Friend",
      subtitle: "认识朋友",
      description: "本周想结识聊得来的同龄人，纯朋友关系优先。",
    },
    DATE: {
      primary: "Date",
      subtitle: "浪漫约会",
      description: "本周以恋爱为目的，希望认识能发展感情的对象。",
    },
    BOTH: {
      primary: "Both",
      subtitle: "都可以",
      description: "朋友或约会都欢迎，看缘分发展。",
    },
  },
  "en-US": {
    FRIEND: {
      primary: "Friend",
      subtitle: "Meet friends",
      description: "Prioritize meeting someone easy to talk to as a friend.",
    },
    DATE: {
      primary: "Date",
      subtitle: "Romantic dating",
      description: "Meet someone with clear romantic potential this week.",
    },
    BOTH: {
      primary: "Both",
      subtitle: "Open to both",
      description: "Friendship or dating can both work; let the fit decide.",
    },
  },
};

export const WEEKLY_INTENT_LABELS: Record<WeeklyIntent, WeeklyIntentLabels> =
  WEEKLY_INTENT_LABELS_BY_LOCALE[DEFAULT_LOCALE];

export function weeklyIntentLabelsFor(
  intent: WeeklyIntent,
  locale: SupportedLocale = DEFAULT_LOCALE,
) {
  return WEEKLY_INTENT_LABELS_BY_LOCALE[locale][intent];
}

export const WEEKLY_INTENT_MATCHING_RULE_COPY: Record<
  SupportedLocale,
  string
> = {
  "zh-CN":
    "BOTH 与所有意图相容；FRIEND 与 DATE 互斥。可在截止前再改一次。",
  "en-US":
    "BOTH is compatible with every intent; FRIEND and DATE do not match each other. You can still change it before the deadline.",
};

export const WEEKLY_INTENT_LONG_MATCHING_RULE_COPY: Record<
  SupportedLocale,
  string
> = {
  "zh-CN":
    "选择 Friend / Date / Both 之一作为本轮的硬约束 — BOTH 可与任意意图相容，FRIEND 与 DATE 互斥。默认沿用上一轮，也可在截止前改成别的。",
  "en-US":
    "Choose Friend, Date, or Both as this round's hard constraint. BOTH can match any intent, while FRIEND and DATE do not match each other. The previous round's intent carries over by default, and you can change it before the deadline.",
};

export const WEEKLY_INTENT_LEGACY_LABELS: Record<
  WeeklyIntent,
  WeeklyIntentLabels
> = {
  FRIEND: {
    primary: "Friend",
    subtitle: "认识朋友",
    description: "本周想结识聊得来的同龄人，纯朋友关系优先。",
  },
  DATE: {
    primary: "Date",
    subtitle: "浪漫约会",
    description: "本周以恋爱为目的，希望认识能发展感情的对象。",
  },
  BOTH: {
    primary: "Both",
    subtitle: "都可以",
    description: "朋友或约会都欢迎，看缘分发展。",
  },
};

const WEEKLY_INTENT_SET = new Set<string>(WEEKLY_INTENTS);

export function isWeeklyIntent(value: unknown): value is WeeklyIntent {
  return typeof value === "string" && WEEKLY_INTENT_SET.has(value);
}

export function readWeeklyIntent(value: unknown): WeeklyIntent | null {
  return isWeeklyIntent(value) ? value : null;
}

const WEEKLY_INTENT_ATOMS: Record<WeeklyIntent, ReadonlyArray<"FRIEND" | "DATE">> = {
  FRIEND: ["FRIEND"],
  DATE: ["DATE"],
  BOTH: ["FRIEND", "DATE"],
};

/**
 * Two participants are compatible iff their intent atom sets share at least
 * one element. BOTH expands to {FRIEND, DATE} so it bridges everyone.
 */
export function areWeeklyIntentsCompatible(
  left: WeeklyIntent,
  right: WeeklyIntent,
): boolean {
  const rightAtoms = WEEKLY_INTENT_ATOMS[right];
  return WEEKLY_INTENT_ATOMS[left].some((atom) => rightAtoms.includes(atom));
}

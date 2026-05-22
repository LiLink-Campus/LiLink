/**
 * Weekly matching intent — stored per cycle participation rather than on the
 * user profile, so each round can preserve or override the previous value.
 *
 * Compatibility rule (intersection-based):
 *   FRIEND ↔ FRIEND  ✓        FRIEND ↔ DATE  ✗        FRIEND ↔ BOTH  ✓
 *   DATE   ↔ DATE    ✓        DATE   ↔ BOTH  ✓        BOTH   ↔ BOTH  ✓
 */

export const WEEKLY_INTENTS = ["FRIEND", "DATE", "BOTH"] as const;
export type WeeklyIntent = (typeof WEEKLY_INTENTS)[number];

export const WEEKLY_INTENT_LABELS: Record<
  WeeklyIntent,
  { primary: string; subtitle: string; description: string }
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

const WEEKLY_INTENT_ATOMS: Record<
  WeeklyIntent,
  ReadonlyArray<"FRIEND" | "DATE">
> = {
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

import { WEEKLY_INTENT_LABELS } from "../../../lib/weekly-intent";
import { canEditCurrentCycleParticipation } from "./format";
import { profileAttentionHashForKey } from "./profile-attention";
import type {
  ContactPreferencesPayload,
  DashboardMatch,
  DashboardPayload,
  DashboardTask,
  QuestionnaireAttentionPayload,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The discriminated set of "what should the user do RIGHT NOW" buckets that
 * the home Focus card can express. Each variant carries everything needed
 * to render the card (CTA href, optional progress, preview copy).
 *
 * Ordered roughly by escalation priority — when multiple are true, the
 * resolver picks the highest-priority one. Keep in sync with `resolveFocus`.
 */
export type FocusContext =
  | { kind: "MEETUP_NEEDS_ACTION"; task: DashboardTask }
  | { kind: "MEETUP_WAITING"; task: DashboardTask }
  | { kind: "MATCH_INTRODUCED_NO_MEETUP"; matchId: string }
  | { kind: "MATCH_REVEALED_AWAITING_INTRO"; match: DashboardMatch }
  | { kind: "QUESTIONNAIRE_ATTENTION"; href: string; pendingCount: number; missingCount: number }
  | { kind: "QUESTIONNAIRE_INCOMPLETE"; href: string; percent: number; submitted: boolean }
  | { kind: "INTENT_REQUIRED"; revealAt: string | null; deadlineIso: string | null }
  | { kind: "OPTED_IN_AWAITING_REVEAL"; revealAt: string | null; intentLabel: string }
  | { kind: "LAST_ROUND_UNMATCHED"; codename: string; nextRevealAt: string | null }
  | { kind: "CYCLE_LOCKED"; codename: string; revealAt: string | null }
  | { kind: "CONTACT_PREFERENCES"; href: string }
  | { kind: "NO_OPEN_CYCLE" };

export type FocusInputs = {
  dashboard: DashboardPayload;
  contactPreferences: ContactPreferencesPayload;
  questionnaire: {
    percent: number;
    submitted: boolean;
    eligibleToOptIn: boolean;
    hasIncompleteDraft: boolean;
    attention: QuestionnaireAttentionPayload | null;
  };
};

function questionnaireHref(attention: QuestionnaireAttentionPayload | null) {
  const key = attention?.pendingKeys?.[0];
  return key
    ? `/dashboard/profile${profileAttentionHashForKey(key)}`
    : "/dashboard/profile";
}

function meetupTaskIsAttention(task: DashboardTask) {
  return task.userTurnStatus === "NEEDS_YOUR_RESPONSE";
}

function meetupTaskIsWaiting(task: DashboardTask) {
  return task.userTurnStatus === "WAITING_FOR_COUNTERPART";
}

function contactPreferencesAreDefault(prefs: ContactPreferencesPayload) {
  const hasExtra = prefs.methods.some((m) => m.value.trim().length > 0);
  return !hasExtra && prefs.preferredContactChannel === "EMAIL";
}

/**
 * Resolve the single highest-priority Focus state. We treat this as a pure
 * function so it can be tested by reading expected outputs. Priority:
 *
 *  1. Active meetup that needs your response (most urgent — block on it)
 *  2. Active meetup waiting on the counterpart (still primary task)
 *  3. Reveal happened, you're introduced, no meetup yet
 *  4. Reveal happened, match exists but not introduced yet
 *  5. Questionnaire has explicit attention items (required fixes)
 *  6. Questionnaire below 100% / never submitted
 *  7. Cycle open and intent still needs confirmation → choose intent
 *  8. You're opted in, intent set, cycle still editable → wait for reveal
 *  9. Last round revealed and you weren't matched
 * 10. Cycle locked (after deadline) — nothing actionable
 * 11. Contact preferences are still default (only-email) — gentle nudge
 * 12. No cycle at all → wait for next round
 */
export function resolveFocus(inputs: FocusInputs): FocusContext {
  const { dashboard, contactPreferences, questionnaire } = inputs;
  const cycle = dashboard.currentCycle;
  const canEdit = canEditCurrentCycleParticipation(cycle);
  const isOptedIn = cycle?.participationStatus === "OPTED_IN";
  const intent = cycle?.intent ?? null;
  const tasks = dashboard.tasks ?? [];
  const meetupSummary = dashboard.meetupSummary ?? null;

  // 1 & 2: active meetup tasks take precedence over everything else.
  const meetupActionTask = tasks.find(
    (task) => task.type === "MEETUP" && meetupTaskIsAttention(task),
  );
  if (meetupActionTask) {
    return { kind: "MEETUP_NEEDS_ACTION", task: meetupActionTask };
  }

  const meetupWaitingTask = tasks.find(
    (task) => task.type === "MEETUP" && meetupTaskIsWaiting(task),
  );
  if (meetupWaitingTask) {
    return { kind: "MEETUP_WAITING", task: meetupWaitingTask };
  }

  // 3: you've been introduced but haven't started a meetup yet.
  const latestMatch = dashboard.latestMatch;
  const introduced = Boolean(latestMatch?.introducedAt);
  if (introduced && latestMatch && !meetupSummary) {
    return { kind: "MATCH_INTRODUCED_NO_MEETUP", matchId: latestMatch.id };
  }

  // 4: revealed, match generated, awaiting intro (the user needs to act).
  if (
    latestMatch &&
    !introduced &&
    dashboard.latestMatchVisibility !== "LIMITED"
  ) {
    return { kind: "MATCH_REVEALED_AWAITING_INTRO", match: latestMatch };
  }

  // 5: questionnaire has explicit attention items (missing required after
  // a schema update, or pending updates to review). This blocks opt-in.
  const attention = questionnaire.attention;
  const pendingCount = attention?.pendingUpdatedKeys?.length ?? 0;
  const missingCount = attention?.missingRequiredKeys?.length ?? 0;
  if (attention && (pendingCount > 0 || missingCount > 0)) {
    return {
      kind: "QUESTIONNAIRE_ATTENTION",
      href: questionnaireHref(attention),
      pendingCount,
      missingCount,
    };
  }

  // 6: questionnaire still incomplete (never submitted or below threshold).
  if (!questionnaire.eligibleToOptIn) {
    return {
      kind: "QUESTIONNAIRE_INCOMPLETE",
      href: questionnaireHref(attention),
      percent: questionnaire.percent,
      submitted: questionnaire.submitted,
    };
  }

  // 7: cycle is open and you can participate, but intent still needs confirmation.
  if (cycle && canEdit && (!isOptedIn || !intent)) {
    return {
      kind: "INTENT_REQUIRED",
      revealAt: cycle.revealAt,
      deadlineIso: cycle.participationDeadline,
    };
  }

  // 8: opted in, intent set, waiting for reveal while edits are still open.
  if (cycle && canEdit && isOptedIn && intent) {
    return {
      kind: "OPTED_IN_AWAITING_REVEAL",
      revealAt: cycle.revealAt,
      intentLabel: WEEKLY_INTENT_LABELS[intent].primary,
    };
  }

  // 9: current cycle exists but has passed the deadline / is in late stages.
  if (cycle && !canEdit) {
    return {
      kind: "CYCLE_LOCKED",
      codename: cycle.codename,
      revealAt: cycle.revealAt,
    };
  }

  // 10: last round we participated in but didn't get matched.
  const lastRound = dashboard.lastRevealedRound;
  if (
    lastRound &&
    lastRound.participationStatus === "OPTED_IN" &&
    !lastRound.matched
  ) {
    return {
      kind: "LAST_ROUND_UNMATCHED",
      codename: lastRound.codename,
      nextRevealAt: cycle?.revealAt ?? null,
    };
  }

  // 11: contact preferences still on default email-only — gentle nudge.
  if (contactPreferencesAreDefault(contactPreferences)) {
    return { kind: "CONTACT_PREFERENCES", href: "/dashboard/me" };
  }

  // 12: nothing else to do — there's no open cycle right now.
  return { kind: "NO_OPEN_CYCLE" };
}

/**
 * Friendly Chinese label for the reveal timestamp, used in body copy
 * across Focus card variants. Returns null for missing input.
 */
export function describeRevealMoment(iso: string | null): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat("zh-CN", {
    weekday: "short",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(new Date(iso));
}

/**
 * Compact "本周 周六 21:00 截止参与" style label used in meta chips.
 */
export function describeDeadlineLabel(iso: string | null): string | null {
  if (!iso) return null;
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
  return `本周 ${formatter.format(new Date(iso))} 截止`;
}

/**
 * Relative "in N hours / days / minutes" copy for waiting states.
 */
export function describeRelativeUntil(iso: string | null): string | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  const diff = target - Date.now();
  if (diff <= 0) return "已开启";
  const days = Math.floor(diff / DAY_MS);
  const hours = Math.floor((diff % DAY_MS) / (60 * 60 * 1000));
  if (days > 0) {
    return `还有 ${days} 天 ${hours} 小时`;
  }
  if (hours > 0) {
    return `还有 ${hours} 小时`;
  }
  const minutes = Math.max(1, Math.floor(diff / (60 * 1000)));
  return `还有 ${minutes} 分钟`;
}

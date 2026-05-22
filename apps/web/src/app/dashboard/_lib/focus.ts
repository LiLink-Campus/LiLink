import { HARD_MATCH_KEYS } from "../../../lib/hard-match";
import { profileAttentionHashForKey } from "./profile-attention";
import type {
  ContactPreferencesPayload,
  DashboardTask,
  QuestionnaireAttentionPayload,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

type QuestionnaireHrefPreference = "pending" | "missing";

export function questionnaireHref(
  attention: QuestionnaireAttentionPayload | null,
  preference: QuestionnaireHrefPreference = "pending",
) {
  const preferredKeys =
    preference === "missing"
      ? attention?.missingRequiredKeys
      : attention?.pendingUpdatedKeys;
  const key = preferredKeys?.[0] ?? attention?.pendingKeys?.[0];
  if (key === HARD_MATCH_KEYS.oneLinerIntro) {
    return "/dashboard/me/card";
  }
  return key
    ? `/dashboard/profile${profileAttentionHashForKey(key)}`
    : "/dashboard/profile";
}

export function meetupTaskIsAttention(task: DashboardTask) {
  return task.userTurnStatus === "NEEDS_YOUR_RESPONSE";
}

export function meetupTaskIsWaiting(task: DashboardTask) {
  return task.userTurnStatus === "WAITING_FOR_COUNTERPART";
}

export function contactPreferencesAreDefault(prefs: ContactPreferencesPayload) {
  const hasExtra = prefs.methods.some((m) => m.value.trim().length > 0);
  return !hasExtra && prefs.preferredContactChannel === "EMAIL";
}

/**
 * Friendly Chinese label for the reveal timestamp, used across agenda copy.
 * Returns null for missing input.
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
 * Compact "本周 周六 21:00 截止参与" style label.
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

/**
 * Compact "D-3" style countdown label for the home greeting eyebrow,
 * counting whole days until the reveal moment. Returns "D-Day" on the
 * reveal day and null when the timestamp is missing or already past.
 */
export function describeDaysUntilLabel(iso: string | null): string | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  const diff = target - Date.now();
  if (diff <= 0) return null;
  const days = Math.floor(diff / DAY_MS);
  return days <= 0 ? "D-Day" : `D-${days}`;
}

import type { SupportedLocale } from "@lilink/shared";
import type { DashboardCurrentCycle } from "./types";

export function formatCycleRevealAt(
  iso: string,
  locale: SupportedLocale = "zh-CN",
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(iso));
}

export function formatCycleDeadline(
  iso: string,
  locale: SupportedLocale = "zh-CN",
): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(new Date(iso));
}

export function canEditCurrentCycleParticipation(
  cycle: DashboardCurrentCycle | null,
): boolean {
  if (!cycle) {
    return false;
  }

  return (
    cycle.status === "OPEN" &&
    new Date(cycle.participationDeadline).getTime() > Date.now()
  );
}

export function normalizeMatchReasons(reasons: unknown): string[] {
  if (!Array.isArray(reasons)) {
    return [];
  }
  return reasons.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

export function normalizeConversationTopics(topics: unknown): string[] {
  if (!Array.isArray(topics)) {
    return [];
  }

  return topics.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

export function limitedHistoryExplanation(
  reason: "REPORTED" | "BLOCKED" | null,
  locale: SupportedLocale = "zh-CN",
): string {
  if (reason === "REPORTED") {
    return locale === "zh-CN"
      ? "该条记录因你曾举报相关匹配而隐藏了对方可识别信息。"
      : "Identifying information is hidden because you reported this match.";
  }
  if (reason === "BLOCKED") {
    return locale === "zh-CN"
      ? "该条记录因你与对方存在屏蔽关系，仅保留流程信息。"
      : "Only process information is retained because there is a block between you and the other person.";
  }
  return locale === "zh-CN"
    ? "该条匹配记录的可识别信息已被系统隐藏。"
    : "Identifying information for this match has been hidden.";
}

/** User-visible label for the report ticket chip (API `ReportStatus`). */
export function reportHandlingChipLabel(
  status: string | null,
  locale: SupportedLocale = "zh-CN",
): string | null {
  if (!status) {
    return null;
  }
  const copy =
    locale === "zh-CN"
      ? {
          open: "举报处理中",
          resolved: "处理完成",
          dismissed: "已驳回",
        }
      : {
          open: "Report in review",
          resolved: "Resolved",
          dismissed: "Dismissed",
        };
  switch (status) {
    case "OPEN":
      return copy.open;
    case "RESOLVED":
      return copy.resolved;
    case "DISMISSED":
      return copy.dismissed;
    default:
      return copy.open;
  }
}

export function buildDashboardFieldId(...parts: Array<string | number>) {
  return `dashboard-${parts.join("-")}`;
}

export const DEFAULT_REPORT_REASON = "骚扰";
export const REPORT_REASON_OPTIONS = [
  {
    value: "骚扰",
    label: { "zh-CN": "骚扰", "en-US": "Harassment" },
  },
  {
    value: "冒犯内容",
    label: { "zh-CN": "冒犯内容", "en-US": "Offensive content" },
  },
  {
    value: "身份异常",
    label: { "zh-CN": "身份异常", "en-US": "Identity issue" },
  },
  {
    value: "恶意行为",
    label: { "zh-CN": "恶意行为", "en-US": "Malicious behavior" },
  },
  {
    value: "其他",
    label: { "zh-CN": "其他", "en-US": "Other" },
  },
] as const;
export const REPORT_FORM_SECTION_ID = "dashboard-report-panel";

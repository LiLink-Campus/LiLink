export function formatCycleRevealAt(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(iso));
}

export function formatCycleDeadline(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(new Date(iso));
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

export function limitedHistoryExplanation(
  reason: "REPORTED" | "BLOCKED" | null,
): string {
  if (reason === "REPORTED") {
    return "该条记录因你曾举报相关匹配而隐藏了对方可识别信息。";
  }
  if (reason === "BLOCKED") {
    return "该条记录因你与对方存在屏蔽关系，仅保留流程信息。";
  }
  return "该条匹配记录的可识别信息已被系统隐藏。";
}

/** User-visible label for the report ticket chip (API `ReportStatus`). */
export function reportHandlingChipLabel(status: string | null): string | null {
  if (!status) {
    return null;
  }
  switch (status) {
    case "OPEN":
      return "举报处理中";
    case "RESOLVED":
      return "处理完成";
    case "DISMISSED":
      return "已驳回";
    default:
      return "举报处理中";
  }
}

export function buildDashboardFieldId(...parts: Array<string | number>) {
  return `dashboard-${parts.join("-")}`;
}

export const DEFAULT_REPORT_REASON = "骚扰";
export const REPORT_FORM_SECTION_ID = "dashboard-report-panel";

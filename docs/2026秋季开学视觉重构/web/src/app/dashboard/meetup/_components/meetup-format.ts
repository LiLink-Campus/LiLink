import type {
  MeetupOption,
  MeetupProgressStatus,
  MeetupProposalScope,
  MeetupSessionResponse,
} from "../../../../lib/api";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Shanghai",
});

const TIME_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Shanghai",
});

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("zh-CN", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Shanghai",
});

export const PROGRESS_LABELS: Record<MeetupProgressStatus, string> = {
  NOT_STARTED: "尚未开始",
  NEGOTIATING: "协商中",
  LOCATION_CONFIRMED_TIME_PENDING: "地点已定，待确认时间",
  TIME_CONFIRMED_LOCATION_PENDING: "时间已定，待确认地点",
  AWAITING_FINAL_CONFIRMATION: "等待最终确认",
  LOCKED: "已确认",
  CANCELED: "已取消",
  EXPIRED: "已过期",
  ARCHIVED: "已归档",
};

export const SCOPE_LABELS: Record<MeetupProposalScope, string> = {
  BOTH: "时间和地点",
  TIME_ONLY: "只提议时间",
  LOCATION_ONLY: "只提议地点",
};

export function formatMeetupShortDateTime(iso: string | null | undefined) {
  if (!iso) return "待确认";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "待确认";
  return SHORT_DATE_FORMATTER.format(date);
}

export function formatMeetupTimeRange(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
) {
  if (!startsAt || !endsAt) return "时间待确认";
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "时间待确认";
  }
  return `${DATE_TIME_FORMATTER.format(start)} - ${TIME_FORMATTER.format(end)}`;
}

export function optionPrimaryText(option: MeetupOption) {
  if (option.kind === "TIME") {
    return formatMeetupTimeRange(option.startsAt, option.endsAt);
  }
  return option.placeName ?? "地点待确认";
}

export function optionSecondaryText(option: MeetupOption) {
  if (option.kind === "TIME") {
    const tolerance = option.toleranceMinutes ?? 10;
    return `预留 ${tolerance} 分钟弹性`;
  }
  return "系统候选地点";
}

export function sessionIsTerminal(session: MeetupSessionResponse) {
  return (
    session.status === "CANCELED" ||
    session.status === "EXPIRED" ||
    session.status === "ARCHIVED"
  );
}

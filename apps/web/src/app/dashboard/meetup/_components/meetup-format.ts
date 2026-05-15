import type {
  MeetupOption,
  MeetupOptionStatus,
  MeetupParticipantTurnState,
  MeetupProgressStatus,
  MeetupProposal,
  MeetupProposalScope,
  MeetupSessionResponse,
  MeetupUserTurnStatus,
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

export const TURN_LABELS: Record<MeetupUserTurnStatus, string> = {
  NOT_STARTED: "可开始",
  WAITING_FOR_COUNTERPART: "等待对方回应",
  NEEDS_YOUR_RESPONSE: "需要你回应",
  NONE: "无需操作",
};

export const PARTICIPANT_TURN_LABELS: Record<
  MeetupParticipantTurnState,
  string
> = {
  NONE: "无待办",
  REQUIRED: "待回应",
  WAITING: "等待中",
};

export const SCOPE_LABELS: Record<MeetupProposalScope, string> = {
  BOTH: "时间和地点",
  TIME_ONLY: "只提议时间",
  LOCATION_ONLY: "只提议地点",
};

export const OPTION_STATUS_LABELS: Record<MeetupOptionStatus, string> = {
  PENDING: "待选择",
  CONFIRMED: "已选中",
  REJECTED: "已拒绝",
  DISABLED: "未选中",
};

export function formatMeetupDateTime(iso: string | null | undefined) {
  if (!iso) return "待确认";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "待确认";
  return DATE_TIME_FORMATTER.format(date);
}

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
  if (
    typeof option.latitude === "number" &&
    typeof option.longitude === "number"
  ) {
    return "系统候选地点";
  }
  return "系统候选地点";
}

export function proposalSummary(proposal: MeetupProposal) {
  const timeCount = proposal.options.filter(
    (option) => option.kind === "TIME",
  ).length;
  const locationCount = proposal.options.filter(
    (option) => option.kind === "LOCATION",
  ).length;
  const parts = [];
  if (timeCount > 0) parts.push(`${timeCount} 个时间`);
  if (locationCount > 0) parts.push(`${locationCount} 个地点`);
  return parts.length > 0 ? parts.join(" · ") : SCOPE_LABELS[proposal.scope];
}

export function sessionIsTerminal(session: MeetupSessionResponse) {
  return (
    session.status === "CANCELED" ||
    session.status === "EXPIRED" ||
    session.status === "ARCHIVED"
  );
}

export function disabledActionText(reason: string | null | undefined) {
  if (!reason) return "当前状态下暂不可操作。";
  if (reason.includes("REVISION")) return "你已使用过本次安排的修改机会。";
  if (reason.includes("LOCK") || reason.includes("START")) {
    return "见面时间已临近或已开始，不能再修改。";
  }
  if (reason.includes("EXPIRED")) return "本次协商已过期。";
  if (reason.includes("TERMINAL")) return "本次安排已结束。";
  return "当前状态下暂不可操作。";
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  acceptMeetupOptions,
  cancelMeetupSession,
  createMeetupProposal,
  fetchMeetupLocationCandidates,
  finalConfirmMeetupSession,
  markMeetupSessionSeen,
  rejectMeetupProposal,
  reviseMeetupSession,
  startMeetupSession,
  type AcceptMeetupOptionsPayload,
  type AuthMePayload,
  type MeetupLocationCandidate,
  type MeetupOption,
  type MeetupOptionKind,
  type MeetupProposal,
  type MeetupProposalPayload,
  type MeetupProposalScope,
  type MeetupSessionResponse,
} from "../../../../lib/api";
import { useDashboardSessionSeed } from "../../_components/DashboardSessionSeed";
import { useToast } from "../../_components/ToastProvider";
import type { DashboardMeetupSummary } from "../../_lib/types";
import {
  disabledActionText,
  formatMeetupDateTime,
  formatMeetupShortDateTime,
  formatMeetupTimeRange,
  OPTION_STATUS_LABELS,
  optionPrimaryText,
  optionSecondaryText,
  PARTICIPANT_TURN_LABELS,
  PROGRESS_LABELS,
  proposalSummary,
  SCOPE_LABELS,
  sessionIsTerminal,
  TURN_LABELS,
} from "./meetup-format";

type SavingAction =
  | "start"
  | "proposal"
  | "accept"
  | "reject"
  | "finalConfirm"
  | "revise"
  | "cancel"
  | null;

type ConfirmDialogState =
  | {
      kind: "finalConfirm";
      title: string;
      description: string;
      confirmLabel: string;
      details?: string[];
    }
  | {
      kind: "cancel";
      title: string;
      description: string;
      confirmLabel: string;
      details?: string[];
    }
  | {
      kind: "revise";
      title: string;
      description: string;
      confirmLabel: string;
      proposal: MeetupProposalPayload;
      details: string[];
    };

type TimeSlot = {
  key: string;
  startsAt: string;
  endsAt: string;
};

type LocationSlot = {
  key: string;
  locationCandidateId: string;
};

type MeetupProposalSubmitSummary = {
  scope: MeetupProposalScope;
  timeOptions: string[];
  locationOptions: string[];
  noteText: string | null;
};

type MeetupProgressStepState = "complete" | "active" | "pending" | "muted";

type MeetupActionBriefTone = "default" | "attention" | "waiting" | "locked";

type MeetupActionBriefContent = {
  title: string;
  body: string;
  tone: MeetupActionBriefTone;
};

const MIN_LEAD_MINUTES = 30;
const CHINA_STANDARD_TIME_OFFSET_MINUTES = 8 * 60;
const MINUTE_MS = 60_000;
const DATETIME_LOCAL_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

const MEETUP_PROGRESS_STEPS: Array<{
  key: "proposal" | "selection" | "confirmation";
  label: string;
}> = [
  { key: "proposal", label: "发起方案" },
  { key: "selection", label: "选择可行项" },
  { key: "confirmation", label: "确认安排" },
];

const MESSAGE_TYPE_LABELS: Record<
  MeetupSessionResponse["messages"][number]["type"],
  string
> = {
  PROPOSE: "提出方案",
  ACCEPT: "接受选项",
  REJECT: "拒绝方案",
  FINAL_CONFIRM: "最终确认",
  REVISE_AFTER_LOCK: "修改已确认安排",
  CANCEL: "退出安排",
};

const PROPOSAL_STATUS_LABELS: Record<MeetupProposal["status"], string> = {
  PENDING: "待回应",
  PARTIALLY_ACCEPTED: "部分接受",
  CONFIRMED: "已确认",
  REJECTED: "已拒绝",
  SUPERSEDED: "已更新",
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function chinaStandardTimeParts(date: Date) {
  const shifted = new Date(
    date.getTime() + CHINA_STANDARD_TIME_OFFSET_MINUTES * MINUTE_MS,
  );
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

function toDatetimeLocalValue(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(
    parts.hour,
  )}:${pad(parts.minute)}`;
}

function chinaStandardDatetimeLocalValue(date: Date) {
  return toDatetimeLocalValue(chinaStandardTimeParts(date));
}

function defaultChinaStandardDatetimeLocalValue(
  daysFromToday: number,
  hour: number,
  minute: number,
) {
  const today = chinaStandardTimeParts(new Date());
  const instant =
    Date.UTC(today.year, today.month - 1, today.day + daysFromToday, hour, minute) -
    CHINA_STANDARD_TIME_OFFSET_MINUTES * MINUTE_MS;
  return chinaStandardDatetimeLocalValue(new Date(instant));
}

function minimumChinaStandardDatetimeLocalValue() {
  return chinaStandardDatetimeLocalValue(
    new Date(Date.now() + MIN_LEAD_MINUTES * MINUTE_MS),
  );
}

function defaultTimeSlot(index: number): TimeSlot {
  const daysFromToday = index + 1;
  return {
    key: `time-${Date.now()}-${index}-${Math.random().toString(36).slice(2)}`,
    startsAt: defaultChinaStandardDatetimeLocalValue(daysFromToday, 18, 0),
    endsAt: defaultChinaStandardDatetimeLocalValue(daysFromToday, 19, 0),
  };
}

function defaultLocationSlot(index: number): LocationSlot {
  return {
    key: `location-${Date.now()}-${index}-${Math.random()
      .toString(36)
      .slice(2)}`,
    locationCandidateId: "",
  };
}

function chinaStandardDatetimeToIso(value: string) {
  const match = DATETIME_LOCAL_PATTERN.exec(value);
  if (!match) return null;

  const [, rawYear, rawMonth, rawDay, rawHour, rawMinute, rawSecond] = match;
  const year = Number(rawYear);
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  const second = rawSecond ? Number(rawSecond) : 0;

  if (
    month < 1 ||
    month > 12 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59
  ) {
    return null;
  }

  const utcMs =
    Date.UTC(year, month - 1, day, hour, minute, second) -
    CHINA_STANDARD_TIME_OFFSET_MINUTES * MINUTE_MS;
  const roundTrip = chinaStandardTimeParts(new Date(utcMs));
  if (
    roundTrip.year !== year ||
    roundTrip.month !== month ||
    roundTrip.day !== day ||
    roundTrip.hour !== hour ||
    roundTrip.minute !== minute ||
    roundTrip.second !== second
  ) {
    return null;
  }

  return new Date(utcMs).toISOString();
}

function cleanOptionalText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function errorMessage(caughtError: unknown, fallback: string) {
  return caughtError instanceof Error ? caughtError.message : fallback;
}

function requiredKindsFromProposal(proposal: MeetupProposal | null) {
  const kinds = new Set<MeetupOptionKind>();
  proposal?.options.forEach((option) => kinds.add(option.kind));
  return kinds;
}

function defaultScopeForSession(session: MeetupSessionResponse) {
  if (session.currentPlan.timeOption && !session.currentPlan.locationOption) {
    return "LOCATION_ONLY" as const;
  }
  if (!session.currentPlan.timeOption && session.currentPlan.locationOption) {
    return "TIME_ONLY" as const;
  }
  return "BOTH" as const;
}

function buildProposalSubmitSummary(
  proposal: MeetupProposalPayload,
  candidates: MeetupLocationCandidate[],
): MeetupProposalSubmitSummary {
  const candidateById = new Map(
    candidates.map((candidate) => [candidate.id, candidate]),
  );

  return {
    scope: proposal.scope,
    timeOptions:
      proposal.timeOptions?.map((option) =>
        formatMeetupTimeRange(option.startsAt, option.endsAt),
      ) ?? [],
    locationOptions:
      proposal.locationOptions?.map((option) => {
        const candidate = candidateById.get(option.locationCandidateId);
        if (!candidate) return `地点候选 ${option.locationCandidateId}`;
        return candidate.name;
      }) ?? [],
    noteText: proposal.noteText ?? proposal.notePreset ?? null,
  };
}

function revisionConfirmationDetails(summary: MeetupProposalSubmitSummary) {
  return [
    `提议范围：${SCOPE_LABELS[summary.scope]}`,
    summary.timeOptions.length > 0
      ? `时间选项：${summary.timeOptions.join("；")}`
      : "时间选项：本次不修改时间",
    summary.locationOptions.length > 0
      ? `地点选项：${summary.locationOptions.join("；")}`
      : "地点选项：本次不修改地点",
    `说明：${summary.noteText ?? "无"}`,
  ];
}

export function MeetupStartClient({
  initialUser,
  matchId,
  meetupSummary,
}: {
  initialUser: AuthMePayload;
  matchId: string | null;
  meetupSummary: DashboardMeetupSummary | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  useDashboardSessionSeed(initialUser);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitStartProposal(proposal: MeetupProposalPayload) {
    if (!matchId) {
      setError("缺少匹配 ID，无法发起见面安排。");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const nextSession = await startMeetupSession(matchId, proposal);
      showToast("见面倡议已发送");
      router.push(`/dashboard/meetup/${nextSession.id}`);
      router.refresh();
    } catch (caughtError) {
      setError(errorMessage(caughtError, "见面倡议发送失败。"));
    } finally {
      setSaving(false);
    }
  }

  if (!matchId) {
    return (
      <div className="app-page-shell app-page-shell-narrow">
        <section className="app-card">
          <div className="app-card-head">
            <h1 className="app-card-title">安排第一次见面</h1>
            <span className="app-card-status is-warn">缺少参数</span>
          </div>
          <p className="app-card-muted">缺少匹配 ID，不能发起见面安排。</p>
          <Link className="button-secondary meetup-inline-link" href="/dashboard/match">
            返回我的匹配
          </Link>
        </section>
      </div>
    );
  }

  if (meetupSummary) {
    const terminal =
      meetupSummary.status === "CANCELED" ||
      meetupSummary.status === "EXPIRED" ||
      meetupSummary.status === "ARCHIVED";

    return (
      <div className="app-page-shell app-page-shell-narrow">
        <section className="app-page-header">
          <p className="eyebrow">Meetup</p>
          <h1>安排第一次见面</h1>
          <p>这个匹配已经有一条见面安排记录。</p>
        </section>
        {terminal ? (
          <MeetupTerminalSummary
            terminalText={
              meetupSummary.terminalText ??
              "本次见面安排已结束，当前版本暂不支持重新发起。"
            }
          />
        ) : (
          <section className="app-card">
            <div className="app-card-head">
              <h2 className="app-card-title">
                {meetupSummary.status === "LOCKED"
                  ? "见面安排已确认"
                  : "见面安排进行中"}
              </h2>
              <span className="app-card-status is-on">
                {PROGRESS_LABELS[meetupSummary.progressStatus]}
              </span>
            </div>
            <p className="app-card-muted">
              {meetupSummary.status === "LOCKED"
                ? "当前匹配已确认第一次见面的时间和地点。"
                : "当前匹配正在协商第一次见面的时间和地点。"}
            </p>
            <MeetupSummaryFacts summary={meetupSummary} />
            <Link className="button-primary meetup-inline-link" href={meetupSummary.href}>
              查看见面安排
            </Link>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="app-page-shell app-page-shell-narrow">
      <section className="app-page-header">
        <p className="eyebrow">Meetup</p>
        <h1>安排第一次见面</h1>
        <p>
          先给对方发出第一条方案。你可以同时提议时间和地点，也可以只先确定其中一项；每项保留 2-3 个候选。
        </p>
      </section>
      <section className="app-card">
        <div className="app-card-head">
          <h2 className="app-card-title">第一条见面倡议</h2>
          <span className="app-card-status">北京时间</span>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <MeetupProposalForm
          defaultScope="BOTH"
          disabled={saving}
          submitLabel="安排第一次见面"
          submittingLabel="发送中…"
          onSubmit={submitStartProposal}
        />
      </section>
    </div>
  );
}

export function MeetupSessionClient({
  initialUser,
  initialSession,
}: {
  initialUser: AuthMePayload;
  initialSession: MeetupSessionResponse;
}) {
  useDashboardSessionSeed(initialUser);
  const [session, setSession] = useState(initialSession);

  useEffect(() => {
    setSession(initialSession);
  }, [initialSession]);

  useEffect(() => {
    let sent = false;
    let canceled = false;

    function sendSeenIfVisible() {
      if (sent || canceled || document.visibilityState !== "visible") {
        return;
      }
      sent = true;
      void markMeetupSessionSeen(session.id).catch(() => {
        // Seen is intentionally silent and should not surface a toast or error.
      });
    }

    sendSeenIfVisible();
    if (!sent) {
      document.addEventListener("visibilitychange", sendSeenIfVisible);
    }

    return () => {
      canceled = true;
      document.removeEventListener("visibilitychange", sendSeenIfVisible);
    };
  }, [session.id]);

  return (
    <div className="app-page-shell app-page-shell-narrow">
      <MeetupStatusHeader session={session} />
      <MeetupCurrentPlanCard session={session} />
      <div className="meetup-workspace">
        <MeetupConversationTimeline
          session={session}
          currentUserId={initialUser.id}
        />
        <MeetupActionPanel
          session={session}
          currentUserId={initialUser.id}
          onSessionChange={setSession}
        />
      </div>
    </div>
  );
}

function MeetupStatusHeader({ session }: { session: MeetupSessionResponse }) {
  return (
    <section className="app-page-header meetup-status-header">
      <p className="eyebrow">Meetup</p>
      <h1>第一次见面安排</h1>
      <p>
        与 {session.counterpartDisplayName ?? "对方"} 协商第一次见面的时间和地点。
      </p>
      <div className="meetup-status-row">
        <span className="app-card-status is-on">
          {PROGRESS_LABELS[session.progressStatus]}
        </span>
        <span className="app-card-status">
          {TURN_LABELS[session.userTurnStatus]}
        </span>
        {session.expiresAt ? (
          <span className="app-card-status">
            有效至 {formatMeetupShortDateTime(session.expiresAt)}
          </span>
        ) : null}
      </div>
      <MeetupProgressTracker session={session} />
    </section>
  );
}

function MeetupProgressTracker({ session }: { session: MeetupSessionResponse }) {
  const stepStates = meetupProgressStepStates(session);

  return (
    <ol className="meetup-progress-tracker" aria-label="见面安排进度">
      {MEETUP_PROGRESS_STEPS.map((step, index) => (
        <li className={`is-${stepStates[step.key]}`} key={step.key}>
          <span className="meetup-step-marker">{index + 1}</span>
          <span>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

function meetupProgressStepStates(
  session: MeetupSessionResponse,
): Record<(typeof MEETUP_PROGRESS_STEPS)[number]["key"], MeetupProgressStepState> {
  const terminal = sessionIsTerminal(session);
  const locked = session.status === "LOCKED" || session.progressStatus === "LOCKED";
  const hasProposal = session.messages.some(
    (message) => message.type === "PROPOSE" || message.type === "REVISE_AFTER_LOCK",
  );
  const hasAnyConfirmedOption =
    session.confirmedTimeOptionId !== null ||
    session.confirmedLocationOptionId !== null;
  const awaitingFinal =
    session.progressStatus === "AWAITING_FINAL_CONFIRMATION" ||
    session.finalConfirmRequiredByUserId !== null;

  if (terminal && !locked) {
    return {
      proposal: hasProposal ? "complete" : "muted",
      selection: hasAnyConfirmedOption ? "complete" : "muted",
      confirmation: "muted",
    };
  }

  return {
    proposal: hasProposal ? "complete" : "active",
    selection: locked || awaitingFinal
      ? "complete"
      : hasProposal
        ? "active"
        : "pending",
    confirmation: locked ? "complete" : awaitingFinal ? "active" : "pending",
  };
}

function MeetupCurrentPlanCard({ session }: { session: MeetupSessionResponse }) {
  const plan = session.currentPlan;

  return (
    <section className="app-card meetup-current-plan" aria-label="当前方案">
      <div className="app-card-head">
        <h2 className="app-card-title">当前方案</h2>
        <span className="app-card-status">
          {session.status === "LOCKED" ? "已锁定" : "协商中"}
        </span>
      </div>
      <div className="meetup-plan-grid">
        <MeetupPlanFact
          label="时间"
          value={formatMeetupTimeRange(plan.startsAt, plan.endsAt)}
          muted={!plan.startsAt || !plan.endsAt}
        />
        <MeetupPlanFact
          label="地点"
          value={plan.placeName ?? "地点待确认"}
          muted={!plan.placeName}
        />
      </div>
    </section>
  );
}

function MeetupPlanFact({
  label,
  value,
  muted,
  detail,
}: {
  label: string;
  value: string;
  muted?: boolean;
  detail?: string | null;
}) {
  return (
    <div className={muted ? "meetup-plan-fact is-muted" : "meetup-plan-fact"}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function MeetupConversationTimeline({
  session,
  currentUserId,
}: {
  session: MeetupSessionResponse;
  currentUserId: string;
}) {
  const messages = useMemo(
    () =>
      [...session.messages].sort(
        (left, right) =>
          new Date(left.createdAt).getTime() -
          new Date(right.createdAt).getTime(),
      ),
    [session.messages],
  );

  return (
    <section className="app-card meetup-timeline-card" aria-label="协商时间线">
      <div className="app-card-head">
        <h2 className="app-card-title">协商时间线</h2>
        <span className="app-card-status">{messages.length} 条</span>
      </div>
      {messages.length === 0 ? (
        <p className="app-card-muted">暂无协商记录。</p>
      ) : (
        <ol className="meetup-timeline">
          {messages.map((message) => (
            <li key={message.id}>
              <MeetupMessageCard
                message={message}
                session={session}
                currentUserId={currentUserId}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function MeetupMessageCard({
  message,
  session,
  currentUserId,
}: {
  message: MeetupSessionResponse["messages"][number];
  session: MeetupSessionResponse;
  currentUserId: string;
}) {
  const isMine = message.actorUserId === currentUserId;
  const actor = isMine ? "你" : session.counterpartDisplayName ?? "对方";

  return (
    <article
      className={isMine ? "meetup-message-card is-mine" : "meetup-message-card"}
    >
      <header>
        <div>
          <strong>{actor}</strong>
          <span>{MESSAGE_TYPE_LABELS[message.type]}</span>
        </div>
        <time dateTime={message.createdAt}>
          {formatMeetupDateTime(message.createdAt)}
        </time>
      </header>
      {message.noteText ? <p>{message.noteText}</p> : null}
      {message.proposal ? (
        <MeetupProposalCard proposal={message.proposal} session={session} />
      ) : null}
    </article>
  );
}

function MeetupProposalCard({
  proposal,
  session,
}: {
  proposal: MeetupProposal;
  session: MeetupSessionResponse;
}) {
  const timeOptions = proposal.options.filter(
    (option) => option.kind === "TIME",
  );
  const locationOptions = proposal.options.filter(
    (option) => option.kind === "LOCATION",
  );

  return (
    <div className={`meetup-proposal-card status-${proposal.status.toLowerCase()}`}>
      <div className="meetup-proposal-head">
        <span>{SCOPE_LABELS[proposal.scope]}</span>
        <span>{PROPOSAL_STATUS_LABELS[proposal.status]}</span>
      </div>
      <p>{proposalSummary(proposal)}</p>
      {timeOptions.length > 0 ? (
        <MeetupOptionGroup
          title="时间选项"
          options={timeOptions}
          session={session}
        />
      ) : null}
      {locationOptions.length > 0 ? (
        <MeetupOptionGroup
          title="地点选项"
          options={locationOptions}
          session={session}
        />
      ) : null}
    </div>
  );
}

function MeetupOptionGroup({
  title,
  options,
  session,
}: {
  title: string;
  options: MeetupOption[];
  session: MeetupSessionResponse;
}) {
  return (
    <div className="meetup-option-group">
      <span>{title}</span>
      <div className="meetup-option-list">
        {options.map((option) => (
          <MeetupOptionCard option={option} session={session} key={option.id} />
        ))}
      </div>
    </div>
  );
}

function MeetupOptionCard({
  option,
  session,
}: {
  option: MeetupOption;
  session: MeetupSessionResponse;
}) {
  const current =
    option.id === session.confirmedTimeOptionId ||
    option.id === session.confirmedLocationOptionId;

  return (
    <div
      className={`meetup-option-card status-${option.status.toLowerCase()}${
        current ? " is-current" : ""
      }`}
    >
      <strong>{optionPrimaryText(option)}</strong>
      <span>{optionSecondaryText(option)}</span>
      <small>{current ? "当前方案" : OPTION_STATUS_LABELS[option.status]}</small>
    </div>
  );
}

function MeetupActionPanel({
  session,
  currentUserId,
  onSessionChange,
}: {
  session: MeetupSessionResponse;
  currentUserId: string;
  onSessionChange: (session: MeetupSessionResponse) => void;
}) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState<SavingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(
    null,
  );
  const [revisionFormOpen, setRevisionFormOpen] = useState(false);

  useEffect(() => {
    setError(null);
    setRevisionFormOpen(false);
  }, [session.id, session.status, session.currentProposalId]);

  async function runMutation(
    nextSaving: Exclude<SavingAction, null>,
    load: () => Promise<MeetupSessionResponse>,
    fallback: string,
    onSuccess?: () => void,
  ) {
    setSaving(nextSaving);
    setError(null);
    try {
      const nextSession = await load();
      onSessionChange(nextSession);
      onSuccess?.();
    } catch (caughtError) {
      setError(errorMessage(caughtError, fallback));
    } finally {
      setSaving(null);
    }
  }

  async function submitProposal(proposal: MeetupProposalPayload) {
    await runMutation(
      "proposal",
      () => createMeetupProposal(session.id, proposal),
      "见面倡议发送失败。",
      () => showToast("见面倡议已发送"),
    );
  }

  async function submitAccept(payload: AcceptMeetupOptionsPayload) {
    await runMutation(
      "accept",
      () => acceptMeetupOptions(session.id, payload),
      "接受选项失败。",
      () => {
        if (payload.timeOptionId) showToast("已接受这个时间");
        if (payload.locationOptionId) showToast("已接受这个地点");
      },
    );
  }

  async function submitReject(noteText: string) {
    const proposalId = session.currentPendingProposal?.id;
    if (!proposalId) {
      setError("当前没有可拒绝的提议。");
      return;
    }
    const note = cleanOptionalText(noteText);
    await runMutation(
      "reject",
      () =>
        rejectMeetupProposal(session.id, proposalId, {
          ...(note ? { noteText: note } : {}),
        }),
      "拒绝提议失败。",
    );
  }

  async function submitFinalConfirm() {
    await runMutation(
      "finalConfirm",
      () => finalConfirmMeetupSession(session.id),
      "最终确认失败。",
      () => showToast("见面安排已确认"),
    );
  }

  async function submitRevision(proposal: MeetupProposalPayload) {
    await runMutation(
      "revise",
      () => reviseMeetupSession(session.id, proposal),
      "修改倡议发送失败。",
      () => {
        setRevisionFormOpen(false);
        showToast("修改倡议已发送");
      },
    );
  }

  async function confirmRevision(
    proposal: MeetupProposalPayload,
    summary: MeetupProposalSubmitSummary,
  ) {
    setError(null);
    setConfirmDialog({
      kind: "revise",
      title: "发送这次修改倡议？",
      description:
        "请确认下面的修改内容。提交后对方需要重新回应；每人每次安排只能修改一次。",
      confirmLabel: "确认发送",
      proposal,
      details: revisionConfirmationDetails(summary),
    });
  }

  async function submitCancel() {
    await runMutation(
      "cancel",
      () => cancelMeetupSession(session.id),
      "退出见面安排失败。",
      () => showToast("已退出本次见面安排"),
    );
  }

  const terminal = sessionIsTerminal(session);
  const proposal = session.currentPendingProposal;
  const canAccept = session.availableActions.accept.enabled && proposal;
  const canReject = session.availableActions.reject.enabled && proposal;
  const canPropose = session.availableActions.propose.enabled;
  const canFinalConfirm = session.availableActions.finalConfirm.enabled;
  const canCancel = session.availableActions.cancel.enabled;
  const canRevise = session.availableActions.reviseAfterLock.enabled;
  const defaultScope = defaultScopeForSession(session);
  const actionBrief = meetupActionBrief({
    session,
    terminal,
    canAccept: Boolean(canAccept),
    canFinalConfirm,
    canPropose,
  });

  return (
    <aside className="app-card meetup-action-panel" aria-label="当前操作">
      <div className="app-card-head">
        <h2 className="app-card-title">当前操作</h2>
        <span className="app-card-status">
          {TURN_LABELS[session.userTurnStatus]}
        </span>
      </div>

      <MeetupActionBrief content={actionBrief} />

      <MeetupParticipantList
        session={session}
        currentUserId={currentUserId}
      />

      {error ? <p className="form-error">{error}</p> : null}

      {terminal ? (
        <MeetupTerminalState session={session} />
      ) : session.status === "LOCKED" ? (
        <>
          <MeetupLockedSummary session={session} />
          {revisionFormOpen ? (
            <div className="meetup-revision-form">
              <MeetupProposalForm
                defaultScope="BOTH"
                disabled={saving === "revise"}
                submitLabel="预览并确认修改"
                submittingLabel="发送中…"
                onSubmit={confirmRevision}
              />
            </div>
          ) : null}
          <div className="meetup-action-stack">
            {canRevise ? (
              <button
                className="button-primary"
                type="button"
                disabled={saving !== null}
                onClick={() => {
                  setError(null);
                  setRevisionFormOpen((current) => !current);
                }}
              >
                {revisionFormOpen ? "收起修改表单" : "修改已确认安排"}
              </button>
            ) : (
              <p className="app-card-muted">
                {disabledActionText(
                  session.availableActions.reviseAfterLock.reason,
                )}
              </p>
            )}
            {canCancel ? (
              <button
                className="button-secondary meetup-danger-button"
                type="button"
                disabled={saving !== null}
                onClick={() =>
                  setConfirmDialog({
                    kind: "cancel",
                    title: "取消已确认的见面？",
                    description:
                      "取消后本次见面安排会结束，当前版本不能重新发起；这也会计入你的一次修改记录。",
                    confirmLabel: "确认取消",
                  })
                }
              >
                取消已确认的见面
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          {canFinalConfirm ? (
            <MeetupFinalConfirmPanel
              session={session}
              disabled={saving !== null}
              onConfirm={() =>
                setConfirmDialog({
                  kind: "finalConfirm",
                  title: "确认这次见面安排？",
                  description:
                    "确认后本次见面的时间和地点会锁定；见面开始前仍可按规则修改一次。",
                  confirmLabel: "确认安排",
                })
              }
            />
          ) : null}

          {canAccept ? (
            <MeetupAcceptPanel
              key={proposal.id}
              proposal={proposal}
              disabled={saving !== null}
              onAccept={submitAccept}
              onReject={canReject ? submitReject : null}
            />
          ) : null}

          {canPropose ? (
            <details
              className="meetup-proposal-details"
              open={!canAccept && !canFinalConfirm}
            >
              <summary>
                {canFinalConfirm ? "继续协商" : canAccept ? "提出新方案" : "发送见面倡议"}
              </summary>
              <MeetupProposalForm
                defaultScope={defaultScope}
                disabled={saving === "proposal"}
                submitLabel="发送见面倡议"
                submittingLabel="发送中…"
                onSubmit={submitProposal}
              />
            </details>
          ) : !canAccept && !canFinalConfirm ? (
            <p className="app-card-muted">
              {disabledActionText(session.availableActions.propose.reason)}
            </p>
          ) : null}

          {canCancel ? (
            <button
              className="button-secondary meetup-danger-button"
              type="button"
              disabled={saving !== null}
              onClick={() =>
                setConfirmDialog({
                  kind: "cancel",
                  title: "退出本次见面安排？",
                  description:
                    "退出后本次见面安排会结束，当前版本不能重新发起。",
                  confirmLabel: "确认退出",
                })
              }
            >
              退出本次见面安排
            </button>
          ) : null}
        </>
      )}

      <ConfirmActionDialog
        open={confirmDialog !== null}
        title={confirmDialog?.title ?? ""}
        description={confirmDialog?.description ?? ""}
        details={confirmDialog?.details ?? []}
        confirmLabel={confirmDialog?.confirmLabel ?? "确认"}
        busy={saving !== null}
        onClose={() => setConfirmDialog(null)}
        onConfirm={() => {
          const current = confirmDialog;
          if (!current) return;
          setConfirmDialog(null);
          if (current.kind === "finalConfirm") {
            void submitFinalConfirm();
            return;
          }
          if (current.kind === "cancel") {
            void submitCancel();
            return;
          }
          void submitRevision(current.proposal);
        }}
      />
    </aside>
  );
}

function meetupActionBrief({
  session,
  terminal,
  canAccept,
  canFinalConfirm,
  canPropose,
}: {
  session: MeetupSessionResponse;
  terminal: boolean;
  canAccept: boolean;
  canFinalConfirm: boolean;
  canPropose: boolean;
}): MeetupActionBriefContent {
  if (terminal) {
    return {
      title: "本次安排已结束",
      body: "你仍可以回到匹配页查看当前匹配状态和历史记录。",
      tone: "default",
    };
  }

  if (session.status === "LOCKED") {
    return {
      title: "安排已确认",
      body: "时间和地点已经锁定；如计划有变化，可按当前规则发起一次修改或取消。",
      tone: "locked",
    };
  }

  if (canFinalConfirm) {
    return {
      title: "等待你最终确认",
      body: "对方已接受完整方案。确认后，这次见面的时间和地点会锁定。",
      tone: "attention",
    };
  }

  if (canAccept) {
    return {
      title: "轮到你回应当前提议",
      body: "选择你能接受的时间或地点；如果都不合适，建议写一句备注再交回对方。",
      tone: "attention",
    };
  }

  if (canPropose) {
    return {
      title:
        session.messages.length === 0 ? "发送第一条见面倡议" : "继续推进这个安排",
      body: "给对方 2-3 个可选项，能让回应更快，也降低来回修改的成本。",
      tone: "default",
    };
  }

  if (session.userTurnStatus === "WAITING_FOR_COUNTERPART") {
    return {
      title: "已交给对方回应",
      body: "对方选择或修改后，这里会切回可操作状态；你也可以先查看当前方案。",
      tone: "waiting",
    };
  }

  return {
    title: "暂无需要处理的操作",
    body: "当前状态不需要你继续填写；如状态变化，首页待办和本页都会更新。",
    tone: "default",
  };
}

function MeetupActionBrief({ content }: { content: MeetupActionBriefContent }) {
  return (
    <div className={`meetup-action-brief is-${content.tone}`}>
      <strong>{content.title}</strong>
      <p>{content.body}</p>
    </div>
  );
}

function MeetupParticipantList({
  session,
  currentUserId,
}: {
  session: MeetupSessionResponse;
  currentUserId: string;
}) {
  return (
    <div className="meetup-participant-list" aria-label="参与者状态">
      {session.participants.map((participant) => (
        <div className="meetup-participant" key={participant.userId}>
          <strong>
            {participant.userId === currentUserId
              ? "你"
              : participant.displayName ?? "对方"}
          </strong>
          <span>{PARTICIPANT_TURN_LABELS[participant.turnState]}</span>
        </div>
      ))}
    </div>
  );
}

function MeetupFinalConfirmPanel({
  session,
  disabled,
  onConfirm,
}: {
  session: MeetupSessionResponse;
  disabled: boolean;
  onConfirm: () => void;
}) {
  return (
    <div className="meetup-final-panel">
      <strong>对方已接受完整方案，等待你最终确认。</strong>
      <p>
        {formatMeetupTimeRange(
          session.currentPlan.startsAt,
          session.currentPlan.endsAt,
        )}
        {session.currentPlan.placeName ? ` · ${session.currentPlan.placeName}` : ""}
      </p>
      <button
        className="button-primary"
        type="button"
        disabled={disabled}
        onClick={onConfirm}
      >
        最终确认
      </button>
    </div>
  );
}

function MeetupAcceptPanel({
  proposal,
  disabled,
  onAccept,
  onReject,
}: {
  proposal: MeetupProposal;
  disabled: boolean;
  onAccept: (payload: AcceptMeetupOptionsPayload) => Promise<void>;
  onReject: ((noteText: string) => Promise<void>) | null;
}) {
  const [selectedTimeId, setSelectedTimeId] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null,
  );
  const [noteText, setNoteText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false);
  const kinds = requiredKindsFromProposal(proposal);
  const timeOptions = proposal.options.filter(
    (option) => option.kind === "TIME",
  );
  const locationOptions = proposal.options.filter(
    (option) => option.kind === "LOCATION",
  );
  const hasSelection = Boolean(selectedTimeId || selectedLocationId);
  const selectedSummary = [
    selectedTimeId ? "已选时间" : null,
    selectedLocationId ? "已选地点" : null,
  ].filter(Boolean);

  async function submitAccept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const payload: AcceptMeetupOptionsPayload = {};
    if (selectedTimeId) payload.timeOptionId = selectedTimeId;
    if (selectedLocationId) payload.locationOptionId = selectedLocationId;
    const note = cleanOptionalText(noteText);
    if (note) payload.noteText = note;

    if (!payload.timeOptionId && !payload.locationOptionId) {
      setError("请至少选择一个可接受的时间或地点。");
      return;
    }

    await onAccept(payload);
  }

  async function submitReject() {
    setError(null);
    if (!onReject) {
      setError("当前不能拒绝这条提议。");
      return;
    }
    await onReject(noteText);
  }

  return (
    <form className="meetup-accept-panel" onSubmit={submitAccept}>
      <div>
        <strong>回应当前提议</strong>
        <p>你可以只接受其中一项，也可以同时接受时间和地点。</p>
      </div>
      {kinds.has("TIME") ? (
        <MeetupChoiceGroup
          title="选择时间"
          options={timeOptions}
          selectedId={selectedTimeId}
          disabled={disabled}
          onSelect={setSelectedTimeId}
        />
      ) : null}
      {kinds.has("LOCATION") ? (
        <MeetupChoiceGroup
          title="选择地点"
          options={locationOptions}
          selectedId={selectedLocationId}
          disabled={disabled}
          onSelect={setSelectedLocationId}
        />
      ) : null}
      <p className="meetup-selection-hint" aria-live="polite">
        {hasSelection
          ? `${selectedSummary.join("，")}。提交后会把选择同步给对方。`
          : "先选择一个你可以接受的时间或地点。"}
      </p>
      <label className="meetup-field">
        <span>给对方的备注（选填，拒绝时建议填写）</span>
        <textarea
          value={noteText}
          maxLength={500}
          disabled={disabled}
          placeholder="例如：这个时间可以，但希望地点再靠近一点。"
          onChange={(event) => setNoteText(event.target.value)}
        />
      </label>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="meetup-action-row">
        <button
          className="button-primary"
          type="submit"
          disabled={disabled || !hasSelection}
        >
          接受所选选项
        </button>
        {onReject ? (
          <button
            className="button-secondary"
            type="button"
            disabled={disabled}
            onClick={() => setConfirmRejectOpen(true)}
          >
            拒绝并交回对方
          </button>
        ) : null}
      </div>
      <ConfirmActionDialog
        open={confirmRejectOpen}
        title="拒绝这条提议？"
        description={
          cleanOptionalText(noteText)
            ? "拒绝后会轮到对方重新提出方案。你的备注会一起发送。"
            : "拒绝后会轮到对方重新提出方案。没有备注也可以继续，但补充原因通常更容易推进。"
        }
        details={[]}
        confirmLabel="确认拒绝"
        busy={disabled}
        onClose={() => setConfirmRejectOpen(false)}
        onConfirm={() => {
          setConfirmRejectOpen(false);
          void submitReject();
        }}
      />
    </form>
  );
}

function MeetupChoiceGroup({
  title,
  options,
  selectedId,
  disabled,
  onSelect,
}: {
  title: string;
  options: MeetupOption[];
  selectedId: string | null;
  disabled: boolean;
  onSelect: (id: string | null) => void;
}) {
  return (
    <fieldset className="meetup-choice-group">
      <legend>{title}</legend>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={
            selectedId === option.id
              ? "meetup-option-choice is-selected"
              : "meetup-option-choice"
          }
          disabled={disabled || option.status === "DISABLED"}
          aria-pressed={selectedId === option.id}
          onClick={() =>
            onSelect(selectedId === option.id ? null : option.id)
          }
        >
          <strong>{optionPrimaryText(option)}</strong>
          <span>{optionSecondaryText(option)}</span>
        </button>
      ))}
    </fieldset>
  );
}

function MeetupLockedSummary({ session }: { session: MeetupSessionResponse }) {
  return (
    <div className="meetup-locked-summary">
      <strong>见面安排已确认</strong>
      <span>
        {formatMeetupTimeRange(
          session.currentPlan.startsAt,
          session.currentPlan.endsAt,
        )}
      </span>
      <span>{session.currentPlan.placeName ?? "地点待确认"}</span>
    </div>
  );
}

function MeetupTerminalState({ session }: { session: MeetupSessionResponse }) {
  const text =
    session.status === "CANCELED"
      ? "本次见面安排已取消，当前版本暂不支持重新发起。"
      : session.status === "EXPIRED"
        ? "本次见面协商已过期，当前版本暂不支持重新发起。"
        : "本次见面安排已归档，当前版本暂不支持重新发起。";

  return (
    <div className="meetup-terminal-state">
      <strong>{PROGRESS_LABELS[session.progressStatus]}</strong>
      <p>{text}</p>
      <Link className="button-secondary" href="/dashboard/match">
        返回我的匹配
      </Link>
    </div>
  );
}

function MeetupTerminalSummary({ terminalText }: { terminalText: string }) {
  return (
    <section className="app-card">
      <div className="app-card-head">
        <h2 className="app-card-title">见面安排已结束</h2>
        <span className="app-card-status">历史记录</span>
      </div>
      <p className="app-card-muted">{terminalText}</p>
      <Link className="button-secondary meetup-inline-link" href="/dashboard/match">
        返回我的匹配
      </Link>
    </section>
  );
}

function MeetupSummaryFacts({ summary }: { summary: DashboardMeetupSummary }) {
  return (
    <div className="meetup-summary-facts">
      <MeetupPlanFact
        label="时间"
        value={formatMeetupTimeRange(
          summary.confirmedStartsAt,
          summary.confirmedEndsAt,
        )}
        muted={!summary.confirmedStartsAt || !summary.confirmedEndsAt}
      />
      <MeetupPlanFact
        label="地点"
        value={summary.confirmedPlaceName ?? "地点待确认"}
        muted={!summary.confirmedPlaceName}
      />
    </div>
  );
}

function MeetupProposalForm({
  defaultScope,
  disabled,
  submitLabel,
  submittingLabel,
  onSubmit,
}: {
  defaultScope: MeetupProposalScope;
  disabled: boolean;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (
    proposal: MeetupProposalPayload,
    summary: MeetupProposalSubmitSummary,
  ) => Promise<void>;
}) {
  const formId = useId();
  const [scope, setScope] = useState<MeetupProposalScope>(defaultScope);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([
    defaultTimeSlot(0),
    defaultTimeSlot(1),
  ]);
  const [locationSlots, setLocationSlots] = useState<LocationSlot[]>([
    defaultLocationSlot(0),
    defaultLocationSlot(1),
  ]);
  const [noteText, setNoteText] = useState("");
  const [candidates, setCandidates] = useState<MeetupLocationCandidate[]>([]);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [candidateReloadKey, setCandidateReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const minimumTimeValue = useMemo(
    () => minimumChinaStandardDatetimeLocalValue(),
    [],
  );

  useEffect(() => {
    setScope(defaultScope);
  }, [defaultScope]);

  useEffect(() => {
    let canceled = false;
    setLoadingCandidates(true);
    setCandidateError(null);
    fetchMeetupLocationCandidates()
      .then((nextCandidates) => {
        if (canceled) return;
        setCandidates(nextCandidates);
        setCandidateError(null);
      })
      .catch((caughtError) => {
        if (canceled) return;
        setCandidates([]);
        setCandidateError(
          errorMessage(caughtError, "地点候选加载失败，请稍后重试。"),
        );
      })
      .finally(() => {
        if (!canceled) setLoadingCandidates(false);
      });
    return () => {
      canceled = true;
    };
  }, [candidateReloadKey]);

  const wantsTime = scope !== "LOCATION_ONLY";
  const wantsLocation = scope !== "TIME_ONLY";
  const selectedLocationIds = locationSlots
    .map((slot) => slot.locationCandidateId)
    .filter(Boolean);
  const completeTimeSlotCount = wantsTime
    ? timeSlots.filter((slot) => slot.startsAt && slot.endsAt).length
    : 0;
  const selectedLocationSlotCount = wantsLocation
    ? locationSlots.filter((slot) => slot.locationCandidateId).length
    : 0;
  const noteLength = cleanOptionalText(noteText)?.length ?? 0;
  const submitDisabled = disabled || (wantsLocation && loadingCandidates);
  const submitButtonLabel = disabled
    ? submittingLabel
    : wantsLocation && loadingCandidates
      ? "正在加载地点…"
      : submitLabel;

  function addTimeSlot() {
    if (timeSlots.length >= 3) return;
    setTimeSlots((current) => [...current, defaultTimeSlot(current.length)]);
  }

  function addLocationSlot() {
    if (locationSlots.length >= 3) return;
    setLocationSlots((current) => [
      ...current,
      defaultLocationSlot(current.length),
    ]);
  }

  function updateTimeSlot(key: string, patch: Partial<TimeSlot>) {
    setTimeSlots((current) =>
      current.map((slot) => (slot.key === key ? { ...slot, ...patch } : slot)),
    );
  }

  function updateLocationSlot(
    key: string,
    patch: Partial<LocationSlot>,
  ) {
    setLocationSlots((current) =>
      current.map((slot) => (slot.key === key ? { ...slot, ...patch } : slot)),
    );
  }

  function removeTimeSlot(key: string) {
    if (timeSlots.length <= 2) return;
    setTimeSlots((current) => current.filter((slot) => slot.key !== key));
  }

  function removeLocationSlot(key: string) {
    if (locationSlots.length <= 2) return;
    setLocationSlots((current) => current.filter((slot) => slot.key !== key));
  }

  function buildProposalPayload() {
    const payload: MeetupProposalPayload = { scope };

    if (wantsTime) {
      if (timeSlots.length < 2 || timeSlots.length > 3) {
        return "请提供 2-3 个时间选项。";
      }
      const leadTime = Date.now() + MIN_LEAD_MINUTES * 60_000;
      const timeOptions = [];
      for (const slot of timeSlots) {
        const startsAt = chinaStandardDatetimeToIso(slot.startsAt);
        const endsAt = chinaStandardDatetimeToIso(slot.endsAt);
        if (!startsAt || !endsAt) return "请填写完整的开始和结束时间。";
        const startMs = new Date(startsAt).getTime();
        const endMs = new Date(endsAt).getTime();
        if (endMs <= startMs) return "结束时间必须晚于开始时间。";
        if (startMs < leadTime) {
          return "时间选项至少需要晚于当前 30 分钟。";
        }
        timeOptions.push({ startsAt, endsAt });
      }
      payload.timeOptions = timeOptions;
    }

    if (wantsLocation) {
      if (candidateError) return candidateError;
      if (locationSlots.length < 2 || locationSlots.length > 3) {
        return "请提供 2-3 个地点选项。";
      }
      const candidateIds = new Set(candidates.map((candidate) => candidate.id));
      const locationCandidateIds = [];
      for (const slot of locationSlots) {
        if (!slot.locationCandidateId) {
          return "请选择一个可用的见面地点。";
        }
        if (!candidateIds.has(slot.locationCandidateId)) {
          return "请选择一个可用的见面地点。";
        }
        locationCandidateIds.push(slot.locationCandidateId);
      }
      if (new Set(locationCandidateIds).size !== locationCandidateIds.length) {
        return "同一条提议中的地点不能重复。";
      }
      payload.locationOptions = locationCandidateIds.map(
        (locationCandidateId) => ({ locationCandidateId }),
      );
    }

    const note = cleanOptionalText(noteText);
    if (note) {
      if (note.length > 500) return "备注不能超过 500 个字。";
      payload.noteText = note;
    }

    return payload;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const payload = buildProposalPayload();
    if (typeof payload === "string") {
      setError(payload);
      return;
    }
    await onSubmit(payload, buildProposalSubmitSummary(payload, candidates));
  }

  return (
    <form className="meetup-proposal-form" onSubmit={submit}>
      <fieldset className="meetup-scope-control" disabled={disabled}>
        <legend>提议范围</legend>
        {(["BOTH", "TIME_ONLY", "LOCATION_ONLY"] as const).map((value) => (
          <label
            className={scope === value ? "is-active" : undefined}
            key={value}
          >
            <input
              type="radio"
              name={`${formId}-scope`}
              checked={scope === value}
              onChange={() => setScope(value)}
            />
            <span>{SCOPE_LABELS[value]}</span>
          </label>
        ))}
      </fieldset>

      {wantsTime ? (
        <fieldset className="meetup-form-section">
          <legend>时间选项</legend>
          <p>
            请提供 2-3 个未来时间段。按北京时间填写，开始时间至少晚于当前 30 分钟。
          </p>
          {timeSlots.map((slot, index) => (
            <div className="meetup-time-slot" key={slot.key}>
              <label className="meetup-field">
                <span>开始时间 {index + 1}</span>
                <input
                  type="datetime-local"
                  value={slot.startsAt}
                  min={minimumTimeValue}
                  disabled={disabled}
                  onChange={(event) =>
                    updateTimeSlot(slot.key, { startsAt: event.target.value })
                  }
                />
              </label>
              <label className="meetup-field">
                <span>结束时间 {index + 1}</span>
                <input
                  type="datetime-local"
                  value={slot.endsAt}
                  min={slot.startsAt || minimumTimeValue}
                  disabled={disabled}
                  onChange={(event) =>
                    updateTimeSlot(slot.key, { endsAt: event.target.value })
                  }
                />
              </label>
              {timeSlots.length > 2 ? (
                <button
                  className="button-secondary"
                  type="button"
                  disabled={disabled}
                  onClick={() => removeTimeSlot(slot.key)}
                >
                  移除
                </button>
              ) : null}
            </div>
          ))}
          {timeSlots.length < 3 ? (
            <button
              className="button-secondary meetup-small-button"
              type="button"
              disabled={disabled}
              onClick={addTimeSlot}
            >
              添加时间
            </button>
          ) : null}
        </fieldset>
      ) : null}

      {wantsLocation ? (
        <fieldset className="meetup-form-section">
          <legend>地点选项</legend>
          <p>请选择 2-3 个候选地点，不要重复。对方可以从这些地点里直接选择。</p>
          {candidateError ? (
            <div className="meetup-inline-feedback">
              <p className="form-error">{candidateError}</p>
              <button
                className="button-secondary meetup-small-button"
                type="button"
                disabled={disabled || loadingCandidates}
                onClick={() => setCandidateReloadKey((current) => current + 1)}
              >
                重新加载地点
              </button>
            </div>
          ) : null}
          {loadingCandidates ? (
            <p className="app-card-muted">正在加载地点候选…</p>
          ) : null}
          {locationSlots.map((slot, index) => (
            <div className="meetup-location-slot" key={slot.key}>
              <MeetupLocationCandidatePicker
                label={`地点 ${index + 1}`}
                value={slot.locationCandidateId}
                candidates={candidates}
                selectedIds={selectedLocationIds}
                disabled={disabled || loadingCandidates}
                onChange={(locationCandidateId) =>
                  updateLocationSlot(slot.key, { locationCandidateId })
                }
              />
              {locationSlots.length > 2 ? (
                <button
                  className="button-secondary"
                  type="button"
                  disabled={disabled}
                  onClick={() => removeLocationSlot(slot.key)}
                >
                  移除
                </button>
              ) : null}
            </div>
          ))}
          {locationSlots.length < 3 ? (
            <button
              className="button-secondary meetup-small-button"
              type="button"
              disabled={disabled || loadingCandidates}
              onClick={addLocationSlot}
            >
              添加地点
            </button>
          ) : null}
        </fieldset>
      ) : null}

      <label className="meetup-field">
        <span>给对方的备注（选填）</span>
        <textarea
          value={noteText}
          maxLength={500}
          disabled={disabled}
          placeholder="例如：更偏好傍晚，地点希望安静一些。"
          onChange={(event) => setNoteText(event.target.value)}
        />
      </label>

      {error ? <p className="form-error">{error}</p> : null}
      <div className="meetup-proposal-preview" aria-live="polite">
        <span>发送前检查</span>
        <strong>
          {[
            wantsTime
              ? `${completeTimeSlotCount}/${timeSlots.length} 个时间已填写`
              : null,
            wantsLocation
              ? `${selectedLocationSlotCount}/${locationSlots.length} 个地点已选择`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </strong>
        <p>
          {noteLength > 0
            ? `备注 ${noteLength}/500 字`
            : "备注可补充偏好或限制，让对方更容易回应。"}
        </p>
      </div>
      <button className="button-primary" type="submit" disabled={submitDisabled}>
        {submitButtonLabel}
      </button>
    </form>
  );
}

function MeetupLocationCandidatePicker({
  label,
  value,
  candidates,
  selectedIds,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  candidates: MeetupLocationCandidate[];
  selectedIds: string[];
  disabled: boolean;
  onChange: (candidateId: string) => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const selectedCandidate =
    candidates.find((candidate) => candidate.id === value) ?? null;

  return (
    <div className="meetup-location-picker">
      <label className="meetup-field">
        <span>{label}</span>
        <select
          value={value}
          disabled={disabled}
          onChange={(event) => {
            setDetailsOpen(false);
            onChange(event.target.value);
          }}
        >
          <option value="">请选择见面地点</option>
          {candidates.map((candidate) => {
            const duplicate =
              selectedIds.includes(candidate.id) && candidate.id !== value;
            return (
              <option
                value={candidate.id}
                disabled={duplicate}
                key={candidate.id}
              >
                {candidate.name}
              </option>
            );
          })}
        </select>
      </label>
      {selectedCandidate ? (
        <div className="meetup-location-detail">
          <button
            type="button"
            className="meetup-detail-toggle"
            disabled={disabled}
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((current) => !current)}
          >
            {detailsOpen ? "收起位置参考" : "查看位置参考"}
          </button>
          {detailsOpen ? (
            <p>
              坐标：{selectedCandidate.latitude.toFixed(6)},{" "}
              {selectedCandidate.longitude.toFixed(6)}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="meetup-location-empty">请选择见面地点</p>
      )}
    </div>
  );
}

function ConfirmActionDialog({
  open,
  title,
  description,
  details,
  confirmLabel,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  details: string[];
  confirmLabel: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const detailsId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      restoreFocusRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      const firstButton = dialog.querySelector<HTMLButtonElement>("button");
      firstButton?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
      restoreFocusRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="meetup-confirm-dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={
        details.length > 0 ? `${descriptionId} ${detailsId}` : descriptionId
      }
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
    >
      <div className="meetup-confirm-dialog-inner">
        <h2 id={titleId}>{title}</h2>
        <p id={descriptionId}>{description}</p>
        {details.length > 0 ? (
          <ul className="meetup-confirm-dialog-details" id={detailsId}>
            {details.map((detail, index) => (
              <li key={`${index}-${detail}`}>{detail}</li>
            ))}
          </ul>
        ) : null}
        <div className="meetup-action-row">
          <button
            className="button-secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </button>
          <button
            className="button-primary"
            type="button"
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

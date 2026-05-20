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
  type MeetupProposalPayload,
  type MeetupProposalScope,
  type MeetupSessionResponse,
} from "../../../../lib/api";
import {
  chinaStandardDatetimeToIso,
} from "@/lib/china-standard-time";
import { useDashboardSessionSeed } from "../../_components/DashboardSessionSeed";
import { useToast } from "../../_components/ToastProvider";
import { MapPinIcon } from "../../_components/icons";
import type { DashboardMeetupSummary } from "../../_lib/types";
import { MeetupActionCard, resolveMeetupActionState } from "./MeetupActionCard";
import {
  MeetupBottomBar,
  type MeetupBottomPrimary,
  type MeetupBottomSecondary,
} from "./MeetupBottomBar";
import { MeetupParticipantStrip } from "./MeetupParticipantStrip";
import {
  MeetupProposalPreview,
  type MeetupProposalPreviewEntry,
} from "./MeetupProposalPreview";
import {
  formatMeetupTimeRange,
  PROGRESS_LABELS,
  SCOPE_LABELS,
  sessionIsTerminal,
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
      kind: "reject";
      title: string;
      description: string;
      confirmLabel: string;
      noteText: string;
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

type PredefinedTimeSlot = {
  label: string;
  startHour: number;
  endHour: number;
  endDayOffset?: number;
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

const MIN_LEAD_MINUTES = 30;

function cleanOptionalText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function errorMessage(caughtError: unknown, fallback: string) {
  return caughtError instanceof Error ? caughtError.message : fallback;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function meetupSlotDatetimeLocalValue(
  date: Date,
  hour: number,
  dayOffset = 0,
) {
  const slotDate = new Date(date);
  slotDate.setDate(date.getDate() + dayOffset);
  const year = slotDate.getFullYear();
  const month = padDatePart(slotDate.getMonth() + 1);
  const day = padDatePart(slotDate.getDate());
  return `${year}-${month}-${day}T${padDatePart(hour)}:00`;
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
        return candidate ? candidate.name : option.locationCandidateId;
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
      <div className="app-page-shell app-page-shell-narrow v2-page-shell">
        <section className="v2-meetup-action-card tone-muted">
          <header className="v2-meetup-action-head">
            <div className="v2-meetup-action-head-body">
              <span className="v2-meetup-action-eyebrow">缺少参数</span>
              <h2 className="v2-meetup-action-title">无法发起见面安排</h2>
            </div>
          </header>
          <p className="v2-meetup-action-subtitle">
            链接里缺少匹配 ID。请从「我的匹配」重新点击「安排第一次见面」。
          </p>
        </section>
        <Link className="button-secondary meetup-inline-link" href="/dashboard/match">
          返回我的匹配
        </Link>
      </div>
    );
  }

  if (meetupSummary) {
    const terminal =
      meetupSummary.status === "CANCELED" ||
      meetupSummary.status === "EXPIRED" ||
      meetupSummary.status === "ARCHIVED";

    return (
      <div className="app-page-shell app-page-shell-narrow v2-page-shell">
        {terminal ? (
          <section className="v2-plan-card">
            <header className="v2-plan-card-head">
              <h2>见面安排已结束</h2>
              <span className="v2-plan-card-pill">历史记录</span>
            </header>
            <p className="app-card-muted">
              {meetupSummary.terminalText ??
                "本次见面安排已结束，当前版本暂不支持重新发起。"}
            </p>
            <Link className="button-secondary meetup-inline-link" href="/dashboard/match">
              返回我的匹配
            </Link>
          </section>
        ) : (
          <section
            className={`v2-plan-card${meetupSummary.status === "LOCKED" ? " is-locked" : ""}`}
          >
            <header className="v2-plan-card-head">
              <h2>
                {meetupSummary.status === "LOCKED"
                  ? "见面安排已确认"
                  : "见面安排进行中"}
              </h2>
              <span
                className={`v2-plan-card-pill${meetupSummary.status === "LOCKED" ? " tone-locked" : ""}`}
              >
                {PROGRESS_LABELS[meetupSummary.progressStatus]}
              </span>
            </header>
            <div className="v2-plan-card-grid">
              <div className="v2-plan-fact">
                <span className="v2-plan-fact-label">时间</span>
                <span
                  className={`v2-plan-fact-value${
                    meetupSummary.confirmedStartsAt && meetupSummary.confirmedEndsAt
                      ? ""
                      : " is-muted"
                  }`}
                >
                  {formatMeetupTimeRange(
                    meetupSummary.confirmedStartsAt,
                    meetupSummary.confirmedEndsAt,
                  )}
                </span>
              </div>
              <div className="v2-plan-fact">
                <span className="v2-plan-fact-label">地点</span>
                <span
                  className={`v2-plan-fact-value${
                    meetupSummary.confirmedPlaceName ? "" : " is-muted"
                  }`}
                >
                  {meetupSummary.confirmedPlaceName ?? "地点待确认"}
                </span>
              </div>
            </div>
            <Link className="button-primary meetup-inline-link" href={meetupSummary.href}>
              查看见面安排
            </Link>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="app-page-shell app-page-shell-narrow v2-page-shell">
      <section className="v2-meetup-action-card tone-attention">
        <header className="v2-meetup-action-head">
          <div className="v2-meetup-action-head-body">
            <span className="v2-meetup-action-eyebrow">现在要做</span>
            <h2 className="v2-meetup-action-title">发起第一条见面方案</h2>
          </div>
        </header>
        <p className="v2-meetup-action-subtitle">
          给对方 2–3 个时间和地点候选；填好后点底部的「发送方案」即可。
        </p>
      </section>
      <section className="app-card">
        <div className="app-card-head">
          <h2 className="app-card-title">方案明细</h2>
          <span className="app-card-status">北京时间</span>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <MeetupProposalForm
          defaultScope="BOTH"
          disabled={saving}
          submitLabel="发送方案"
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
    <MeetupSessionView
      session={session}
      currentUserId={initialUser.id}
      onSessionChange={setSession}
    />
  );
}

function MeetupSessionView({
  session,
  currentUserId,
  onSessionChange,
}: {
  session: MeetupSessionResponse;
  currentUserId: string;
  onSessionChange: (next: MeetupSessionResponse) => void;
}) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState<SavingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(
    null,
  );

  // Lifted accept-form state so the fixed bottom bar can read selection
  // to gate the primary button.
  const [selectedTimeId, setSelectedTimeId] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null,
  );
  const [noteText, setNoteText] = useState("");

  // Locked-state revision form visibility.
  const [revisionFormOpen, setRevisionFormOpen] = useState(false);

  const actionState = resolveMeetupActionState(session);

  // Reset selection / forms when the underlying proposal changes (new
  // pending proposal arrived, status flipped, etc).
  useEffect(() => {
    setSelectedTimeId(null);
    setSelectedLocationId(null);
    setNoteText("");
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
      const next = await load();
      onSessionChange(next);
      onSuccess?.();
    } catch (caughtError) {
      setError(errorMessage(caughtError, fallback));
    } finally {
      setSaving(null);
    }
  }

  async function submitAccept() {
    const payload: AcceptMeetupOptionsPayload = {};
    if (selectedTimeId) payload.timeOptionId = selectedTimeId;
    if (selectedLocationId) payload.locationOptionId = selectedLocationId;
    const note = cleanOptionalText(noteText);
    if (note) payload.noteText = note;

    if (!payload.timeOptionId && !payload.locationOptionId) {
      setError("请至少选择一个可接受的时间或地点。");
      return;
    }

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

  async function submitReject() {
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

  async function submitProposal(proposal: MeetupProposalPayload) {
    await runMutation(
      "proposal",
      () => createMeetupProposal(session.id, proposal),
      "见面倡议发送失败。",
      () => showToast("见面倡议已发送"),
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

  async function submitCancel() {
    await runMutation(
      "cancel",
      () => cancelMeetupSession(session.id),
      "退出见面安排失败。",
      () => showToast("已退出本次见面安排"),
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

  const hasSelection = Boolean(selectedTimeId || selectedLocationId);
  const proposal = session.currentPendingProposal;
  const canReject =
    actionState === "accept" &&
    proposal !== null &&
    session.availableActions.reject.enabled;
  const canCancel = session.availableActions.cancel.enabled;
  const canRevise = session.availableActions.reviseAfterLock.enabled;

  const { primary, secondary, hint } = useMemo<{
    primary: MeetupBottomPrimary | null;
    secondary: MeetupBottomSecondary | null;
    hint: React.ReactNode | undefined;
  }>(() => {
    switch (actionState) {
      case "accept":
        return {
          primary: {
            label: hasSelection ? "确认所选" : "请先选择",
            onClick: () => void submitAccept(),
            disabled: !hasSelection || saving !== null,
            loading: saving === "accept",
          },
          secondary: canReject
            ? {
                label: "拒绝并交回对方",
                onClick: () =>
                  setConfirmDialog({
                    kind: "reject",
                    title: "拒绝这条提议？",
                    description: cleanOptionalText(noteText)
                      ? "拒绝后会轮到对方重新提出方案。你的备注会一起发送。"
                      : "拒绝后会轮到对方重新提出方案。没有备注也可以继续，但补充原因通常更容易推进。",
                    confirmLabel: "确认拒绝",
                    noteText,
                  }),
                disabled: saving !== null,
                tone: "danger",
              }
            : null,
          hint: !hasSelection ? "选择时间和/或地点后即可确认" : undefined,
        };
      case "finalConfirm":
        return {
          primary: {
            label: "确认安排",
            tone: "success",
            onClick: () =>
              setConfirmDialog({
                kind: "finalConfirm",
                title: "确认这次见面安排？",
                description:
                  "确认后本次见面的时间和地点会锁定；见面开始前仍可按规则修改一次。",
                confirmLabel: "确认安排",
                details: [
                  `时间：${formatMeetupTimeRange(
                    session.currentPlan.startsAt,
                    session.currentPlan.endsAt,
                  )}`,
                  `地点：${session.currentPlan.placeName ?? "地点待确认"}`,
                ],
              }),
            disabled: saving !== null,
            loading: saving === "finalConfirm",
          },
          secondary: canCancel
            ? {
                label: "退出本次安排",
                onClick: () =>
                  setConfirmDialog({
                    kind: "cancel",
                    title: "退出本次见面安排？",
                    description:
                      "退出后本次见面安排会结束，当前版本不能重新发起。",
                    confirmLabel: "确认退出",
                  }),
                disabled: saving !== null,
                tone: "danger",
              }
            : null,
          hint: undefined,
        };
      case "waiting":
        return {
          primary: {
            label: "等待对方回应",
            tone: "muted",
            disabled: true,
          },
          secondary: canCancel
            ? {
                label: "退出本次安排",
                onClick: () =>
                  setConfirmDialog({
                    kind: "cancel",
                    title: "退出本次见面安排？",
                    description:
                      "退出后本次见面安排会结束，当前版本不能重新发起。",
                    confirmLabel: "确认退出",
                  }),
                disabled: saving !== null,
                tone: "danger",
              }
            : null,
          hint: undefined,
        };
      case "needsPropose":
        // Form below the action card has its own submit button; the bar
        // here just offers an escape hatch.
        return {
          primary: null,
          secondary: canCancel
            ? {
                label: "退出本次安排",
                onClick: () =>
                  setConfirmDialog({
                    kind: "cancel",
                    title: "退出本次见面安排？",
                    description:
                      "退出后本次见面安排会结束，当前版本不能重新发起。",
                    confirmLabel: "确认退出",
                  }),
                disabled: saving !== null,
                tone: "danger",
              }
            : null,
          hint: "在下方填好方案后点「发送方案」",
        };
      case "locked":
        return {
          primary: canRevise
            ? {
                label: revisionFormOpen ? "收起修改表单" : "修改安排",
                onClick: () => setRevisionFormOpen((current) => !current),
                disabled: saving !== null,
              }
            : {
                label: "见面已确认",
                tone: "success",
                disabled: true,
              },
          secondary: canCancel
            ? {
                label: "取消已确认的见面",
                onClick: () =>
                  setConfirmDialog({
                    kind: "cancel",
                    title: "取消已确认的见面？",
                    description:
                      "取消后本次见面安排会结束，当前版本不能重新发起；这也会计入你的一次修改记录。",
                    confirmLabel: "确认取消",
                  }),
                disabled: saving !== null,
                tone: "danger",
              }
            : null,
          hint: canRevise ? "每人每次安排仅可修改 1 次" : undefined,
        };
      case "terminal":
        return {
          primary: {
            label: "返回我的匹配",
            href: "/dashboard/match",
          },
          secondary: null,
          hint: undefined,
        };
      case "noop":
      default:
        return {
          primary: null,
          secondary: null,
          hint: undefined,
        };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    actionState,
    hasSelection,
    saving,
    canReject,
    canCancel,
    canRevise,
    revisionFormOpen,
    noteText,
    selectedTimeId,
    selectedLocationId,
    session.id,
    session.currentPlan.startsAt,
    session.currentPlan.endsAt,
    session.currentPlan.placeName,
  ]);

  return (
    <>
      <div className="app-page-shell app-page-shell-narrow v2-page-shell">
        <MeetupParticipantStrip session={session} currentUserId={currentUserId} />

        {error ? <p className="form-error">{error}</p> : null}

        <MeetupActionCard
          session={session}
          currentUserId={currentUserId}
          state={actionState}
          selectedTimeId={selectedTimeId}
          selectedLocationId={selectedLocationId}
          noteText={noteText}
          onSelectTime={setSelectedTimeId}
          onSelectLocation={setSelectedLocationId}
          onNoteChange={setNoteText}
        />

        {!sessionIsTerminal(session) ? (
          <MeetupCurrentPlanCard session={session} />
        ) : null}

        {actionState === "needsPropose" ? (
          <section className="app-card">
            <div className="app-card-head">
              <h2 className="app-card-title">方案明细</h2>
              <span className="app-card-status">北京时间</span>
            </div>
            <MeetupProposalForm
              key={defaultScopeForSession(session)}
              defaultScope={defaultScopeForSession(session)}
              disabled={saving === "proposal"}
              submitLabel="发送方案"
              submittingLabel="发送中…"
              onSubmit={submitProposal}
            />
          </section>
        ) : null}

        {actionState === "locked" && revisionFormOpen ? (
          <section className="app-card">
            <div className="app-card-head">
              <h2 className="app-card-title">修改已确认的安排</h2>
              <span className="app-card-status is-warn">
                每人每次安排仅可修改 1 次
              </span>
            </div>
            <MeetupProposalForm
              defaultScope="BOTH"
              disabled={saving === "revise"}
              submitLabel="预览并确认修改"
              submittingLabel="发送中…"
              onSubmit={confirmRevision}
            />
          </section>
        ) : null}
      </div>

      <MeetupBottomBar primary={primary} secondary={secondary} hint={hint} />

      <ConfirmActionDialog
        open={confirmDialog !== null}
        title={confirmDialog?.title ?? ""}
        description={confirmDialog?.description ?? ""}
        details={
          confirmDialog && "details" in confirmDialog
            ? confirmDialog.details ?? []
            : []
        }
        confirmLabel={confirmDialog?.confirmLabel ?? "确认"}
        confirmTone={
          confirmDialog?.kind === "cancel" || confirmDialog?.kind === "reject"
            ? "danger"
            : "primary"
        }
        busy={saving !== null}
        onClose={() => setConfirmDialog(null)}
        onConfirm={() => {
          const current = confirmDialog;
          if (!current) return;
          setConfirmDialog(null);
          switch (current.kind) {
            case "finalConfirm":
              void submitFinalConfirm();
              return;
            case "cancel":
              void submitCancel();
              return;
            case "reject":
              void submitReject();
              return;
            case "revise":
              void submitRevision(current.proposal);
              return;
          }
        }}
      />
    </>
  );
}

function MeetupCurrentPlanCard({ session }: { session: MeetupSessionResponse }) {
  const plan = session.currentPlan;
  const locked = session.status === "LOCKED";
  const timePending = !locked && Boolean(plan.startsAt && plan.endsAt) === false;
  const placePending = !locked && plan.placeName === null;

  return (
    <section
      className={`v2-plan-card${locked ? " is-locked" : ""}`}
      aria-label="当前方案"
    >
      <header className="v2-plan-card-head">
        <h2>{locked ? "已确认的安排" : "当前方案"}</h2>
        <span className={`v2-plan-card-pill${locked ? " tone-locked" : ""}`}>
          {locked ? "已锁定" : "进行中"}
        </span>
      </header>
      <div className="v2-plan-card-grid">
        <div className="v2-plan-fact">
          <span className="v2-plan-fact-label">
            时间{!locked ? "（待确认）" : ""}
          </span>
          <span
            className={`v2-plan-fact-value${
              plan.startsAt && plan.endsAt ? "" : " is-muted"
            }`}
          >
            {formatMeetupTimeRange(plan.startsAt, plan.endsAt)}
          </span>
          {timePending && plan.startsAt && plan.endsAt ? (
            <span className="v2-plan-fact-aux">还需对方确认才会锁定</span>
          ) : null}
        </div>
        <div className="v2-plan-fact">
          <span className="v2-plan-fact-label">
            地点{!locked ? "（待确认）" : ""}
          </span>
          <span
            className={`v2-plan-fact-value${plan.placeName ? "" : " is-muted"}`}
          >
            {plan.placeName ?? "地点待确认"}
          </span>
          {placePending && plan.placeName ? (
            <span className="v2-plan-fact-aux">还需对方确认才会锁定</span>
          ) : null}
        </div>
      </div>
    </section>
  );
}


const PREDEFINED_TIME_SLOTS: PredefinedTimeSlot[] = [
  { label: "18:00-19:00", startHour: 18, endHour: 19 },
  { label: "19:00-20:00", startHour: 19, endHour: 20 },
  { label: "20:00-21:00", startHour: 20, endHour: 21 },
  { label: "19:00-22:00", startHour: 19, endHour: 22 },
  { label: "22:00-23:00", startHour: 22, endHour: 23 },
  { label: "21:00-24:00", startHour: 21, endHour: 0, endDayOffset: 1 },
];

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
  const scope = defaultScope;
  const [step, setStep] = useState<1 | 2 | 3>(() =>
    defaultScope === "LOCATION_ONLY" ? 2 : 1,
  );

  // Time state
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  });
  const [selectedTimes, setSelectedTimes] = useState<TimeSlot[]>([]);

  // Location state
  const [selectedLocations, setSelectedLocations] = useState<LocationSlot[]>([]);

  const [noteText, setNoteText] = useState("");
  const [candidates, setCandidates] = useState<MeetupLocationCandidate[]>([]);
  const [candidateError, setCandidateError] = useState<string | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [candidateReloadKey, setCandidateReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    setLoadingCandidates(true);
    fetchMeetupLocationCandidates()
      .then((nextCandidates) => {
        if (canceled) return;
        setCandidates(nextCandidates);
        setCandidateError(null);
      })
      .catch((caughtError) => {
        if (canceled) return;
        setCandidates([]);
        setCandidateError(errorMessage(caughtError, "地点候选加载失败，请稍后重试。"));
      })
      .finally(() => {
        if (!canceled) setLoadingCandidates(false);
      });
    return () => { canceled = true; };
  }, [candidateReloadKey]);

  const wantsTime = scope !== "LOCATION_ONLY";
  const wantsLocation = scope !== "TIME_ONLY";

  // Generate next 7 days
  const next7Days = useMemo(() => {
    const days = [];
    const today = new Date();
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      days.push(d);
    }
    return days;
  }, []);

  const dayNames = ["日", "一", "二", "三", "四", "五", "六"];

  function handleTimeSlotClick(slot: PredefinedTimeSlot) {
    const startsAt = meetupSlotDatetimeLocalValue(selectedDate, slot.startHour);
    const endsAt = meetupSlotDatetimeLocalValue(
      selectedDate,
      slot.endHour,
      slot.endDayOffset ?? 0,
    );

    const existingIndex = selectedTimes.findIndex(t => t.startsAt === startsAt && t.endsAt === endsAt);

    if (existingIndex >= 0) {
      setSelectedTimes(current => current.filter((_, i) => i !== existingIndex));
    } else {
      if (selectedTimes.length >= 3) {
        setError("最多只能选择 3 个时间段");
        return;
      }
      setError(null);
      setSelectedTimes(current => [
        ...current,
        {
          key: `time-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          startsAt,
          endsAt
        }
      ]);
    }
  }

  function handleLocationClick(candidateId: string) {
    const existingIndex = selectedLocations.findIndex(l => l.locationCandidateId === candidateId);
    if (existingIndex >= 0) {
      setSelectedLocations(current => current.filter((_, i) => i !== existingIndex));
    } else {
      if (selectedLocations.length >= 3) {
        setError("最多只能选择 3 个地点");
        return;
      }
      setError(null);
      setSelectedLocations(current => [
        ...current,
        {
          key: `loc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          locationCandidateId: candidateId
        }
      ]);
    }
  }

  function buildProposalPayload() {
    const payload: MeetupProposalPayload = { scope };

    if (wantsTime) {
      if (selectedTimes.length < 2 || selectedTimes.length > 3) {
        return "请提供 2-3 个时间选项。";
      }
      const leadTime = Date.now() + MIN_LEAD_MINUTES * 60_000;
      const timeOptions = [];
      for (const slot of selectedTimes) {
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
      if (selectedLocations.length < 2 || selectedLocations.length > 3) {
        return "请提供 2-3 个地点选项。";
      }
      const locationOptions = selectedLocations.map(slot => ({
        locationCandidateId: slot.locationCandidateId
      }));

      const uniqueLocations = new Set(locationOptions.map(opt => opt.locationCandidateId));
      if (uniqueLocations.size !== locationOptions.length) {
        return "同一条提议中的地点不能重复。";
      }
      payload.locationOptions = locationOptions;
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

  const previewEntries: MeetupProposalPreviewEntry[] = useMemo(() => {
    const entries: MeetupProposalPreviewEntry[] = [];
    if (wantsTime) {
      selectedTimes.forEach((slot, index) => {
        const startIso = chinaStandardDatetimeToIso(slot.startsAt);
        const endIso = chinaStandardDatetimeToIso(slot.endsAt);
        if (startIso && endIso) {
          entries.push({
            tag: selectedTimes.length === 1 ? "时间" : `时间 ${index + 1}`,
            value: formatMeetupTimeRange(startIso, endIso),
          });
        }
      });
    }
    if (wantsLocation) {
      const byId = new Map(candidates.map((c) => [c.id, c]));
      selectedLocations.forEach((slot, index) => {
        const candidate = byId.get(slot.locationCandidateId);
        entries.push({
          tag: selectedLocations.length === 1 ? "地点" : `地点 ${index + 1}`,
          value: candidate ? candidate.name : slot.locationCandidateId,
        });
      });
    }
    const trimmed = cleanOptionalText(noteText);
    if (trimmed) entries.push({ tag: "备注", value: trimmed });
    return entries;
  }, [wantsTime, wantsLocation, selectedTimes, selectedLocations, candidates, noteText]);

  const canGoNextFrom1 = selectedTimes.length >= 2 && selectedTimes.length <= 3;
  const canGoNextFrom2 =
    !loadingCandidates &&
    !candidateError &&
    selectedLocations.length >= 2 &&
    selectedLocations.length <= 3;

  return (
    <form className="meetup-proposal-form" onSubmit={submit}>
      <div className="meetup-wizard">
        <div className="meetup-wizard-steps">
          {wantsTime && (
            <div className={`meetup-wizard-step ${step === 1 ? 'is-active' : ''}`}>
              1. 选择时间
            </div>
          )}
          {wantsLocation && (
            <div className={`meetup-wizard-step ${step === 2 ? 'is-active' : ''}`}>
              {wantsTime ? '2.' : '1.'} 确认地点
            </div>
          )}
          <div className={`meetup-wizard-step ${step === 3 ? 'is-active' : ''}`}>
            {wantsTime && wantsLocation ? '3.' : '2.'} 发送邀约
          </div>
        </div>

        {error && <p className="form-error">{error}</p>}

        {step === 1 && wantsTime && (
          <div className="meetup-wizard-content">
            <div className="meetup-date-picker">
              <div className="meetup-date-header">
                <span>{selectedDate.getMonth() + 1}月{selectedDate.getDate()}日</span>
              </div>
              <div className="meetup-date-scroll">
                {next7Days.map((date, i) => {
                  const isActive = date.toDateString() === selectedDate.toDateString();
                  return (
                    <div
                      key={i}
                      className={`meetup-date-item ${isActive ? 'is-active' : ''}`}
                      onClick={() => setSelectedDate(date)}
                    >
                      <span>{dayNames[date.getDay()]}</span>
                      <div className="meetup-date-circle">{date.getDate()}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="meetup-section-title">可用时段</div>
              <div className="meetup-time-grid">
                {PREDEFINED_TIME_SLOTS.map((slot, i) => {
                  const startsAt = meetupSlotDatetimeLocalValue(selectedDate, slot.startHour);
                  const endsAt = meetupSlotDatetimeLocalValue(
                    selectedDate,
                    slot.endHour,
                    slot.endDayOffset ?? 0,
                  );

                  const isActive = selectedTimes.some(t => t.startsAt === startsAt && t.endsAt === endsAt);

                  return (
                    <div
                      key={i}
                      className={`meetup-time-slot ${isActive ? 'is-active' : ''}`}
                      onClick={() => handleTimeSlotClick(slot)}
                    >
                      {slot.label}
                    </div>
                  );
                })}
              </div>
            </div>

            {selectedTimes.length > 0 && (
              <div>
                <div className="meetup-section-title">已选时间 ({selectedTimes.length}/3)</div>
                <div className="meetup-selected-tags">
                  {selectedTimes.map((t) => {
                    const startIso = chinaStandardDatetimeToIso(t.startsAt);
                    const endIso = chinaStandardDatetimeToIso(t.endsAt);
                    return (
                      <div key={t.key} className="meetup-selected-tag">
                        {startIso && endIso ? formatMeetupTimeRange(startIso, endIso) : ""}
                        <span
                          className="meetup-selected-tag-remove"
                          onClick={() => setSelectedTimes(curr => curr.filter(x => x.key !== t.key))}
                        >
                          ×
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="meetup-wizard-footer">
              <button
                type="button"
                className="meetup-wizard-next"
                disabled={!canGoNextFrom1}
                onClick={() => {
                  setError(null);
                  setStep(wantsLocation ? 2 : 3);
                }}
              >
                下一步
              </button>
            </div>
          </div>
        )}

        {step === 2 && wantsLocation && (
          <div className="meetup-wizard-content">
            <div>
              <div className="meetup-section-title">推荐地点</div>
              {loadingCandidates ? (
                <p className="app-card-muted">正在加载地点候选…</p>
              ) : candidateError ? (
                <div>
                  <p className="form-error">{candidateError}</p>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => {
                      setError(null);
                      setCandidateError(null);
                      setLoadingCandidates(true);
                      setCandidateReloadKey((current) => current + 1);
                    }}
                  >
                    重新加载地点
                  </button>
                </div>
              ) : (
                <div className="meetup-location-grid">
                  {candidates.map((c) => {
                    const isActive = selectedLocations.some(l => l.locationCandidateId === c.id);
                    return (
                      <div
                        key={c.id}
                        className={`meetup-location-card ${isActive ? 'is-active' : ''}`}
                        onClick={() => handleLocationClick(c.id)}
                      >
                        <div className="meetup-location-image">
                          <MapPinIcon className="w-6 h-6" />
                        </div>
                        <div className="meetup-location-name">{c.name}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedLocations.length > 0 && (
              <div>
                <div className="meetup-section-title">已选地点 ({selectedLocations.length}/3)</div>
                <div className="meetup-selected-tags">
                  {selectedLocations.map((l) => {
                    const c = candidates.find(cand => cand.id === l.locationCandidateId);
                    return (
                      <div key={l.key} className="meetup-selected-tag">
                        {c ? c.name : l.locationCandidateId}
                        <span
                          className="meetup-selected-tag-remove"
                          onClick={() => setSelectedLocations(curr => curr.filter(x => x.key !== l.key))}
                        >
                          ×
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="meetup-wizard-footer" style={{ display: 'flex', gap: '1rem' }}>
              {wantsTime && (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    setError(null);
                    setStep(1);
                  }}
                >
                  上一步
                </button>
              )}
              <button
                type="button"
                className="meetup-wizard-next"
                disabled={!canGoNextFrom2}
                onClick={() => {
                  setError(null);
                  setStep(3);
                }}
              >
                下一步
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="meetup-wizard-content">
            <div className="meetup-section-title">发送方案</div>

            <MeetupProposalPreview
              entries={previewEntries}
              emptyText="先填好上方的时间和地点，对方会看到的内容就会显示在这里。"
            />

            <label className="meetup-field" style={{ marginTop: '1rem' }}>
              <span>给对方的备注（选填）</span>
              <textarea
                value={noteText}
                maxLength={500}
                disabled={disabled}
                placeholder="例如：更偏好傍晚，地点希望安静一些。"
                onChange={(event) => setNoteText(event.target.value)}
              />
            </label>

            <div className="meetup-wizard-footer" style={{ display: 'flex', gap: '1rem' }}>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setError(null);
                  setStep(wantsLocation ? 2 : 1);
                }}
              >
                上一步
              </button>
              <button
                type="submit"
                className="meetup-wizard-next"
                disabled={disabled || (wantsTime && !canGoNextFrom1) || (wantsLocation && !canGoNextFrom2)}
              >
                {disabled ? submittingLabel : submitLabel}
              </button>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
function ConfirmActionDialog({
  open,
  title,
  description,
  details,
  confirmLabel,
  confirmTone = "primary",
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  details: string[];
  confirmLabel: string;
  confirmTone?: "primary" | "danger";
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

  const confirmClass =
    confirmTone === "danger" ? "button-danger" : "button-primary";

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
            className={confirmClass}
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

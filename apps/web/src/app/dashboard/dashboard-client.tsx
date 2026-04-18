"use client";

import Link from "next/link";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { takeNextAutosaveQueueItem } from "@lilink/shared";
import { fetchApi, type AuthMePayload } from "../../lib/api";
import {
  AGE_OPTIONS,
  BIRTH_YEAR_OPTIONS,
  HARD_MATCH_GENDERS,
  HARD_MATCH_LOOKS,
  HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH,
  HEIGHT_OPTIONS,
  MONTH_OPTIONS,
  buildDayOptions,
  getHardMatchFormSaveErrorMessage,
  hardMatchFormFromAnswers,
  toggleMultiSelectValue,
  type HardMatchFormState,
  type HardMatchSchoolOption,
} from "../../lib/hard-match";

export type Question = {
  id: string;
  key: string;
  prompt: string;
  type: "SCALE" | "SINGLE_SELECT" | "MULTI_SELECT";
  required?: boolean;
  selectionLimit?: number | null;
  options?: Array<{
    value: string;
    label: string;
  }>;
};

export type DashboardMatchParticipant = {
  userId: string;
  displayName: string | null;
  introLine: string | null;
  email: string | null;
  schoolName: string | null;
  contactRequestedAt: string | null;
};

export type DashboardMatch = {
  id: string;
  score: number;
  reasons: string[];
  introducedAt: string | null;
  currentUserRequestedAt: string | null;
  reportStatus: string | null;
  participants: DashboardMatchParticipant[];
};

export type DashboardHistoryItem = {
  cycleId: string;
  codename: string;
  revealAt: string;
  participationStatus: "OPTED_IN" | "OPTED_OUT";
  result: "MATCHED" | "UNMATCHED" | "NOT_PARTICIPATED";
  visibility: "VISIBLE" | "LIMITED" | "NOT_APPLICABLE";
  limitedReason: "REPORTED" | "BLOCKED" | null;
  match: DashboardMatch | null;
};

export type DashboardPayload = {
  questionnaireSubmittedAt: string | null;
  currentCycle: {
    id: string;
    codename: string;
    revealAt: string;
    participationDeadline: string;
    status: "DRAFT" | "OPEN" | "REVEAL_READY" | "REVEALED";
    participationStatus: "OPTED_IN" | "OPTED_OUT";
  } | null;
  lastRevealedRound: {
    cycleId: string;
    codename: string;
    revealAt: string;
    participationStatus: "OPTED_IN" | "OPTED_OUT";
    matched: boolean;
  } | null;
  latestMatch: DashboardMatch | null;
  latestMatchVisibility: "VISIBLE" | "LIMITED" | null;
  latestMatchLimitedReason: "REPORTED" | "BLOCKED" | null;
  recentMatchHistory: DashboardHistoryItem[];
};

export type QuestionnairePayload = {
  questions: Question[];
  schools: HardMatchSchoolOption[];
};

export type SavedQuestionnairePayload = {
  answers: Record<string, unknown>;
  submittedAt: string | null;
  draft: {
    softAnswers: Record<string, unknown>;
    hardMatchForm: HardMatchFormState;
    displayName: string;
  } | null;
} | null;

type QuestionnaireSavePayload = {
  answers: Record<string, unknown>;
  hardMatchForm: HardMatchFormState;
  displayName: string;
};

type QuestionnaireSaveResponse = {
  saveState: "DRAFT" | "SUBMITTED";
  questionnaireSubmittedAt: string | null;
  hasDraft: boolean;
};

function buildQuestionnaireSavePayload(
  answers: Record<string, unknown>,
  hardMatchForm: HardMatchFormState,
  displayName: string,
): QuestionnaireSavePayload {
  return {
    answers,
    hardMatchForm,
    displayName,
  };
}

function keepCurrentQuestionAnswers(
  questions: Question[],
  savedAnswers: Record<string, unknown> | undefined,
) {
  if (!savedAnswers) {
    return {};
  }

  const allowedQuestionKeys = new Set(
    questions.map((question) => question.key),
  );

  return Object.fromEntries(
    Object.entries(savedAnswers).filter(([key]) =>
      allowedQuestionKeys.has(key),
    ),
  );
}

function buildDashboardFieldId(...parts: Array<string | number>) {
  return `dashboard-${parts.join("-")}`;
}

const DEFAULT_REPORT_REASON = "骚扰";
const REPORT_FORM_SECTION_ID = "dashboard-report-panel";

/** User-visible label for the report ticket chip (API `ReportStatus`). */
function reportHandlingChipLabel(status: string | null): string | null {
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

function formatCycleRevealAt(iso: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(iso));
}

function normalizeMatchReasons(reasons: unknown): string[] {
  if (!Array.isArray(reasons)) {
    return [];
  }
  return reasons.filter(
    (item): item is string =>
      typeof item === "string" && item.trim().length > 0,
  );
}

function limitedHistoryExplanation(
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

function applyContactSuccessToDashboard(
  current: DashboardPayload | null,
  matchId: string,
  userId: string | null | undefined,
) {
  if (!current) {
    return current;
  }

  const timestamp = new Date().toISOString();

  const updateMatch = (match: DashboardMatch): DashboardMatch => ({
    ...match,
    introducedAt: match.introducedAt ?? timestamp,
    currentUserRequestedAt: timestamp,
    participants: match.participants.map((participant) =>
      participant.userId === userId
        ? { ...participant, contactRequestedAt: timestamp }
        : participant,
    ),
  });

  const nextRecentMatchHistory = current.recentMatchHistory.map<DashboardHistoryItem>(
    (item) =>
      item.match?.id === matchId && item.result === "MATCHED"
        ? { ...item, match: updateMatch(item.match) }
        : item,
  );

  return {
    ...current,
    latestMatch:
      current.latestMatch?.id === matchId
        ? updateMatch(current.latestMatch)
        : current.latestMatch,
    recentMatchHistory: nextRecentMatchHistory,
  };
}

function applyReportSuccessToDashboard(
  current: DashboardPayload | null,
  matchId: string,
) {
  if (!current) {
    return current;
  }

  const limitMatch = (match: DashboardMatch): DashboardMatch => ({
    ...match,
    reportStatus: "OPEN",
    reasons: [],
    participants: [],
  });

  const nextRecentMatchHistory = current.recentMatchHistory.map<DashboardHistoryItem>(
    (item) =>
      item.match?.id === matchId && item.result === "MATCHED"
        ? {
            ...item,
            visibility: "LIMITED",
            limitedReason: "REPORTED",
            match: limitMatch(item.match),
          }
        : item,
  );

  const isLatest = current.latestMatch?.id === matchId;

  return {
    ...current,
    latestMatch: isLatest ? limitMatch(current.latestMatch!) : current.latestMatch,
    latestMatchVisibility: isLatest ? ("LIMITED" as const) : current.latestMatchVisibility,
    latestMatchLimitedReason: isLatest ? ("REPORTED" as const) : current.latestMatchLimitedReason,
    recentMatchHistory: nextRecentMatchHistory,
  };
}

function softQuestionSingleValueIsValid(
  raw: string,
  options: NonNullable<Question["options"]>,
) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return false;
  }

  if (options.some((option) => option.value === trimmed)) {
    return true;
  }

  return options.filter((option) => option.label === trimmed).length === 1;
}

function softQuestionAnswerIsComplete(question: Question, raw: unknown) {
  if (question.required === false) {
    return true;
  }

  const options = question.options ?? [];

  if (question.type === "MULTI_SELECT") {
    if (!Array.isArray(raw) || raw.length === 0) {
      return false;
    }

    const limit = question.selectionLimit;
    if (limit != null && raw.length > limit) {
      return false;
    }

    return raw.every(
      (item) =>
        typeof item === "string" && softQuestionSingleValueIsValid(item, options),
    );
  }

  if (question.type === "SINGLE_SELECT" || question.type === "SCALE") {
    if (typeof raw !== "string") {
      return false;
    }

    return softQuestionSingleValueIsValid(raw, options);
  }

  return false;
}

function getQuestionnaireIncompleteMessage(
  questions: Question[],
  answers: Record<string, unknown>,
  hardMatchForm: HardMatchFormState,
  displayNameForNickname: string,
) {
  const trimmedNickname = displayNameForNickname.trim();
  if (trimmedNickname.length < 2) {
    return "昵称至少填写 2 个字。";
  }

  const hardMessage = getHardMatchFormSaveErrorMessage(hardMatchForm);
  if (hardMessage) {
    return hardMessage;
  }

  const incompleteSoft = questions.filter(
    (question) => !softQuestionAnswerIsComplete(question, answers[question.key]),
  );

  if (incompleteSoft.length === 0) {
    return null;
  }

  if (incompleteSoft.length === 1) {
    return `价值观问卷「${incompleteSoft[0].prompt}」尚未填写。`;
  }

  return `价值观问卷还有 ${incompleteSoft.length} 道必答题未完成。`;
}

function questionnaireAutosaveStatusText(
  saveState: "idle" | "pending" | "saving" | "draft-saved" | "submitted" | "error",
  hasSavedQuestionnaire: boolean,
  hasDraftQuestionnaire: boolean,
) {
  if (saveState === "pending") {
    return "检测到修改，系统即将自动保存。";
  }

  if (saveState === "saving") {
    return "正在自动保存…";
  }

  if (saveState === "draft-saved" || hasDraftQuestionnaire) {
    return hasSavedQuestionnaire
      ? "未完成修改已自动保存为草稿；当前匹配仍按上次正式保存的完整问卷计算。"
      : "草稿已自动保存；补全全部必答项后，系统会自动转为正式问卷。";
  }

  if (saveState === "submitted") {
    return "问卷已自动保存。";
  }

  return "系统会自动保存你的修改。";
}

export default function DashboardPage({
  initialUser,
  initialDashboard,
  initialQuestions,
  initialSchools,
  initialSavedQuestionnaire,
}: {
  initialUser: AuthMePayload;
  initialDashboard: DashboardPayload;
  initialQuestions: Question[];
  initialSchools: HardMatchSchoolOption[];
  initialSavedQuestionnaire: SavedQuestionnairePayload;
}) {
  const initialDraft = initialSavedQuestionnaire?.draft ?? null;
  const initialSubmittedAnswers = initialSavedQuestionnaire?.answers;
  const [user] = useState<AuthMePayload | null>(initialUser);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(
    initialDashboard,
  );
  const [questions] = useState<Question[]>(initialQuestions);
  const [schoolOptions] = useState<HardMatchSchoolOption[]>(initialSchools);
  const [answers, setAnswers] = useState<Record<string, unknown>>(
    initialDraft?.softAnswers ??
      keepCurrentQuestionAnswers(initialQuestions, initialSubmittedAnswers),
  );
  const [hardMatchForm, setHardMatchForm] = useState<HardMatchFormState>(
    () =>
      initialDraft?.hardMatchForm ??
      hardMatchFormFromAnswers(initialSubmittedAnswers, initialSchools),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(
    initialDraft?.displayName ?? initialUser.displayName ?? "",
  );
  const [questionnaireSaveError, setQuestionnaireSaveError] = useState<string | null>(
    null,
  );
  const [questionnaireSaveState, setQuestionnaireSaveState] = useState<
    "idle" | "pending" | "saving" | "draft-saved" | "submitted" | "error"
  >(initialDraft ? "draft-saved" : "idle");
  const [hasQuestionnaireDraft, setHasQuestionnaireDraft] = useState(
    Boolean(initialDraft),
  );
  const [reportReason, setReportReason] = useState(DEFAULT_REPORT_REASON);
  const [reportDetails, setReportDetails] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTargetMatchId, setReportTargetMatchId] = useState<string | null>(
    null,
  );
  const [questionnaireBodyVisible, setQuestionnaireBodyVisible] = useState(true);
  const initialQuestionnaireVisibilitySet = useRef(false);
  const reportSectionRef = useRef<HTMLElement | null>(null);
  const reportReasonSelectRef = useRef<HTMLSelectElement | null>(null);
  const questionnaireAutosaveReady = useRef(false);
  const questionnaireSaveAbortRef = useRef<AbortController | null>(null);
  const questionnaireSaveInFlightRef = useRef(false);
  const queuedQuestionnaireSaveRef = useRef<{
    payload: QuestionnaireSavePayload;
    snapshot: string;
  } | null>(null);
  const questionnaireUnmountedRef = useRef(false);
  const lastSavedQuestionnaireSnapshotRef = useRef(
    JSON.stringify(
      buildQuestionnaireSavePayload(
        initialDraft?.softAnswers ??
          keepCurrentQuestionAnswers(initialQuestions, initialSubmittedAnswers),
        initialDraft?.hardMatchForm ??
          hardMatchFormFromAnswers(initialSubmittedAnswers, initialSchools),
        initialDraft?.displayName ?? initialUser.displayName ?? "",
      ),
    ),
  );

  useEffect(() => {
    if (!dashboard || initialQuestionnaireVisibilitySet.current) {
      return;
    }
    initialQuestionnaireVisibilitySet.current = true;
    if (dashboard.questionnaireSubmittedAt && !initialDraft) {
      setQuestionnaireBodyVisible(false);
    }
  }, [dashboard, initialDraft]);

  useEffect(() => {
    if (!reportOpen || !reportTargetMatchId) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      reportSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      reportReasonSelectRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [reportOpen, reportTargetMatchId]);

  const birthDayOptions = useMemo(
    () => buildDayOptions(hardMatchForm.birthYear, hardMatchForm.birthMonth),
    [hardMatchForm.birthMonth, hardMatchForm.birthYear],
  );

  useEffect(() => {
    if (!hardMatchForm.birthDay) return;
    if (!birthDayOptions.includes(Number(hardMatchForm.birthDay))) {
      setHardMatchForm((current) => ({ ...current, birthDay: "" }));
    }
  }, [birthDayOptions, hardMatchForm.birthDay]);

  const questionnaireSavePayload = useMemo(
    () => buildQuestionnaireSavePayload(answers, hardMatchForm, displayName),
    [answers, hardMatchForm, displayName],
  );
  const questionnaireSnapshot = useMemo(
    () => JSON.stringify(questionnaireSavePayload),
    [questionnaireSavePayload],
  );

  const counterpart = useMemo(() => {
    if (!dashboard?.latestMatch || !user) return null;
    return dashboard.latestMatch.participants.find((p) => p.userId !== user.id) ?? null;
  }, [dashboard?.latestMatch, user]);

  function toggleHardSelection(
    field: "partnerGenders" | "partnerLooks" | "excludedPartnerSchools",
    nextValue: string,
  ) {
    setHardMatchForm((current) => ({
      ...current,
      [field]: toggleMultiSelectValue(current[field], nextValue),
    }));
  }

  async function refreshDashboard() {
    const nextDashboard = await fetchApi<DashboardPayload>("/me/dashboard");
    setDashboard(nextDashboard);
  }

  async function refreshDashboardAfterMutation(
    onRefreshFailureMessage: string,
  ) {
    try {
      await refreshDashboard();
    } catch {
      setError(onRefreshFailureMessage);
    }
  }

  const flushQueuedQuestionnaireSave = useEffectEvent(
    async (payload: QuestionnaireSavePayload, snapshot: string) => {
      if (
        questionnaireUnmountedRef.current ||
        questionnaireSaveInFlightRef.current ||
        snapshot === lastSavedQuestionnaireSnapshotRef.current
      ) {
        return;
      }

      const abortController = new AbortController();

      questionnaireSaveInFlightRef.current = true;
      questionnaireSaveAbortRef.current = abortController;
      setQuestionnaireSaveState("saving");
      setQuestionnaireSaveError(null);

      try {
        const result = await fetchApi<QuestionnaireSaveResponse>(
          "/me/questionnaire",
          {
            method: "PUT",
            body: JSON.stringify(payload),
            signal: abortController.signal,
          },
        );

        if (questionnaireUnmountedRef.current) {
          return;
        }

        lastSavedQuestionnaireSnapshotRef.current = snapshot;
        setHasQuestionnaireDraft(result.hasDraft);
        setDashboard((current) =>
          current
            ? {
                ...current,
                questionnaireSubmittedAt: result.questionnaireSubmittedAt,
              }
            : current,
        );
        setQuestionnaireSaveState(
          result.saveState === "SUBMITTED" ? "submitted" : "draft-saved",
        );
      } catch (caughtError) {
        if (
          caughtError instanceof Error &&
          caughtError.name === "AbortError"
        ) {
          return;
        }

        setQuestionnaireSaveState("error");
        setQuestionnaireSaveError(
          caughtError instanceof Error
            ? caughtError.message
            : "问卷自动保存失败。",
        );
      } finally {
        questionnaireSaveAbortRef.current = null;
        questionnaireSaveInFlightRef.current = false;

        const nextQueuedSave = takeNextAutosaveQueueItem(
          queuedQuestionnaireSaveRef.current,
          {
            isUnmounted: questionnaireUnmountedRef.current,
            lastSavedSnapshot: lastSavedQuestionnaireSnapshotRef.current,
          },
        );
        if (nextQueuedSave) {
          queuedQuestionnaireSaveRef.current = null;
          void flushQueuedQuestionnaireSave(
            nextQueuedSave.payload,
            nextQueuedSave.snapshot,
          );
        }
      }
    },
  );

  const queueQuestionnaireSave = useEffectEvent(
    (payload: QuestionnaireSavePayload, snapshot: string) => {
      if (snapshot === lastSavedQuestionnaireSnapshotRef.current) {
        queuedQuestionnaireSaveRef.current = null;
        return;
      }

      if (questionnaireSaveInFlightRef.current) {
        queuedQuestionnaireSaveRef.current = { payload, snapshot };
        return;
      }

      void flushQueuedQuestionnaireSave(payload, snapshot);
    },
  );

  useEffect(() => {
    if (!questionnaireAutosaveReady.current) {
      questionnaireAutosaveReady.current = true;
      return;
    }

    if (questionnaireSnapshot === lastSavedQuestionnaireSnapshotRef.current) {
      return;
    }

    setQuestionnaireSaveState("pending");
    setQuestionnaireSaveError(null);

    const timeoutId = window.setTimeout(() => {
      queueQuestionnaireSave(questionnaireSavePayload, questionnaireSnapshot);
    }, 800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [questionnaireSavePayload, questionnaireSnapshot]);

  useEffect(
    () => () => {
      questionnaireUnmountedRef.current = true;
      queuedQuestionnaireSaveRef.current = null;
      questionnaireSaveAbortRef.current?.abort();
    },
    [],
  );

  function closeReportForm() {
    setReportOpen(false);
    setReportTargetMatchId(null);
    setReportReason(DEFAULT_REPORT_REASON);
    setReportDetails("");
  }

  function openReportForm(matchId: string) {
    setReportTargetMatchId(matchId);
    setReportReason(DEFAULT_REPORT_REASON);
    setReportDetails("");
    setReportOpen(true);
  }

  function toggleReportForm(matchId: string) {
    if (reportOpen && reportTargetMatchId === matchId) {
      closeReportForm();
      return;
    }

    openReportForm(matchId);
  }

  function reportFormIsOpenForMatch(matchId: string) {
    return reportOpen && reportTargetMatchId === matchId;
  }

  async function toggleParticipation(nextValue: boolean) {
    setSaving("participation");
    setSavedMessage(null);
    try {
      await fetchApi("/me/participation", { method: "PUT", body: JSON.stringify({ optIn: nextValue }) });
      setDashboard((current) =>
        current?.currentCycle
          ? { ...current, currentCycle: { ...current.currentCycle, participationStatus: nextValue ? "OPTED_IN" : "OPTED_OUT" } }
          : current,
      );
      setSavedMessage(nextValue ? "你已参加本轮匹配。" : "你已跳过本轮，仍可随时改回。");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "参与状态更新失败。");
    } finally {
      setSaving(null);
    }
  }

  async function requestContact(matchId: string) {
    setSaving("contact");
    setSavedMessage(null);
    setError(null);
    try {
      await fetchApi(`/me/matches/${matchId}/contact`, { method: "POST" });
      setDashboard((current) =>
        applyContactSuccessToDashboard(current, matchId, user?.id),
      );
      setSavedMessage("已向双方发送引荐邮件。");
      await refreshDashboardAfterMutation(
        "引荐已提交，但页面刷新失败。请稍后手动刷新查看最新状态。",
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "引荐发送失败。");
    } finally {
      setSaving(null);
    }
  }

  async function submitReport() {
    const matchId = reportTargetMatchId;
    if (!matchId) return;
    setSaving("report");
    setSavedMessage(null);
    setError(null);
    try {
      await fetchApi(`/me/matches/${matchId}/report`, {
        method: "POST",
        body: JSON.stringify({ reason: reportReason, ...(reportDetails.trim() ? { details: reportDetails.trim() } : {}) }),
      });
      setDashboard((current) => applyReportSuccessToDashboard(current, matchId));
      closeReportForm();
      setSavedMessage("举报已提交，系统已将该对象从你后续轮次里隔离。");
      await refreshDashboardAfterMutation(
        "举报已提交，但页面刷新失败。请稍后手动刷新查看最新状态。",
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "举报提交失败。");
    } finally {
      setSaving(null);
    }
  }

  const nextRevealLabel = dashboard?.currentCycle
    ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Shanghai" }).format(new Date(dashboard.currentCycle.revealAt))
    : null;

  const questionnaireIncompleteMessage = useMemo(
    () =>
      getQuestionnaireIncompleteMessage(
        questions,
        answers,
        hardMatchForm,
        displayName,
      ),
    [questions, answers, hardMatchForm, displayName],
  );

  const latestMatchReasons = useMemo(
    () => normalizeMatchReasons(dashboard?.latestMatch?.reasons),
    [dashboard?.latestMatch?.reasons],
  );

  const recentMatchHistory = dashboard?.recentMatchHistory ?? [] as DashboardHistoryItem[];

  if (error && !dashboard) {
    return (
      <main className="page-shell prose-shell">
        <section className="content-panel dashboard-panel-wide" style={{ textAlign: "center", padding: "4rem 2rem" }}>
          <p className="eyebrow">我的匹配</p>
          <h1>暂时无法进入该页面</h1>
          <p>{error}</p>
          <Link className="button-primary" href="/login">去登录</Link>
        </section>
      </main>
    );
  }

  const isOptedIn = dashboard?.currentCycle?.participationStatus === "OPTED_IN";
  const introduced = Boolean(dashboard?.latestMatch?.introducedAt);
  const hasSavedQuestionnaire = Boolean(dashboard?.questionnaireSubmittedAt);
  const questionnaireStatus = questionnaireAutosaveStatusText(
    questionnaireSaveState,
    hasSavedQuestionnaire,
    hasQuestionnaireDraft,
  );

  return (
    <main className="page-shell dashboard-page">
      <header className="content-panel dashboard-panel-wide dashboard-panel-tight">
        <p className="eyebrow">我的匹配</p>
        <h1>欢迎回来</h1>
        <p className="dashboard-lede">
          {hasSavedQuestionnaire
            ? hasQuestionnaireDraft
              ? "你有一份未完成草稿；当前轮次仍按上次正式保存的问卷计算。补全后系统会自动切换到最新版本。"
              : "你已保存问卷资料，可随时在下方修改；系统会自动同步最新版本，并在此决定是否参加当前轮次。"
            : "在这里填写个人信息、完成价值观问卷，并决定是否参加当前轮次。系统会自动保存你的编辑进度。"}
        </p>
        {savedMessage ? <p className="form-success">{savedMessage}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </header>

      <section className="dashboard-panel-wide">
        <div className="dashboard-reveal-card">
          <div className="dashboard-reveal-copy">
            <p className="dashboard-reveal-label">下次揭晓时间</p>
            <p className="dashboard-reveal-time">{nextRevealLabel ?? "当前没有开放中的轮次"}</p>
          </div>
          {dashboard?.currentCycle ? (
            <div className="dashboard-reveal-actions">
              <span className={isOptedIn ? "dashboard-participation-pill on" : "dashboard-participation-pill"}>
                {isOptedIn ? "本轮参与中" : "本轮未参与"}
              </span>
              <button className={isOptedIn ? "button-secondary" : "button-primary"} disabled={saving === "participation"} type="button" onClick={() => toggleParticipation(!isOptedIn)}>
                {saving === "participation" ? "更新中…" : isOptedIn ? "取消本轮" : "参加本轮"}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="content-panel dashboard-panel-wide">
        <p className="eyebrow">匹配</p>
        {dashboard?.lastRevealedRound?.participationStatus === "OPTED_IN" && !dashboard.lastRevealedRound.matched ? (
          <>
            <h2>本轮未匹配到对象</h2>
            <p className="dashboard-muted">
              你已参加「{dashboard.lastRevealedRound.codename}」这轮匹配；本轮可配对人数不足或没有与你相容的组合，因此没有为你生成匹配对象。
            </p>
            <p className="dashboard-muted">下一轮开放报名时，在页面上方点击「参加本轮」即可再次参与；你也可以更新问卷，提高下次匹配成功率。</p>
          </>
        ) : dashboard?.latestMatchVisibility === "LIMITED" && dashboard.latestMatch ? (
          <>
            <h2>本轮匹配已受限</h2>
            <p className="dashboard-muted">
              {dashboard.latestMatchLimitedReason === "REPORTED"
                ? "你已举报本轮匹配对象，对方的可识别信息已被隐藏。系统已将该对象从你后续轮次中隔离。"
                : "你与本轮匹配对象之间存在屏蔽关系，对方的可识别信息已被隐藏。"}
            </p>
            <p className="dashboard-muted">
              匹配度：<strong>{dashboard.latestMatch.score.toFixed(1)}</strong> / 100
            </p>
            {(() => {
              const label = reportHandlingChipLabel(dashboard.latestMatch.reportStatus);
              return label ? <span className="domain-chip">{label}</span> : null;
            })()}
          </>
        ) : counterpart ? (
          <>
                       <h2>{introduced ? "引荐与说明" : "本轮匹配"}</h2>
            {introduced ? (
              <p className="dashboard-muted" style={{ marginTop: "0.35rem" }}>
                引荐已完成：系统已向你与对方的注册邮箱各发送一封引荐邮件（含联络方式与下方说明）。请查收收件箱及垃圾邮件夹后，再通过邮件与对方联系。
              </p>
            ) : null}
            {dashboard?.latestMatch ? (
              <p className="dashboard-match-score">
                匹配度：<strong>{dashboard.latestMatch.score.toFixed(1)}</strong> / 100
              </p>
            ) : null}
            {!introduced ? <p className="dashboard-muted">揭晓前不会展示对方学校、昵称等可识别信息；下方说明仅来自客观筛选条件与价值观问卷。</p> : null}
            {introduced && counterpart.email ? <p className="form-success dashboard-match-email">联络邮箱：{counterpart.email}</p> : null}
            {introduced && counterpart.introLine ? (
              <p className="dashboard-muted dashboard-match-intro">对方介绍：{counterpart.introLine}</p>
            ) : null}
            <div className="dashboard-match-reasons">
              <p className="eyebrow" style={{ marginTop: "1.15rem", marginBottom: "0.35rem" }}>
                匹配理由
              </p>
              {introduced ? (
                <p className="dashboard-muted" style={{ margin: "0 0 0.65rem" }}>
                  以下内容与发至你邮箱的引荐邮件中的一致。
                </p>
              ) : (
                <p className="dashboard-muted" style={{ margin: "0 0 0.65rem" }}>
                  系统根据问卷与客观条件生成；点击「双方引荐联系」后，相同说明也会出现在通知邮件里。
                </p>
              )}
              {latestMatchReasons.length > 0 ? (
                <ul className="reason-list" style={{ marginTop: 0 }}>
                  {latestMatchReasons.map((reason, index) => (
                    <li key={`${index}-${reason.slice(0, 48)}`}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <p className="dashboard-muted" style={{ margin: "0 0 0.75rem" }}>
                  暂无匹配理由条目。
                </p>
              )}
            </div>
            <div className="auth-actions">
              {introduced ? (
                <span className="domain-chip">已引荐</span>
              ) : (
                <button
                  className="button-primary"
                  disabled={saving === "contact"}
                  type="button"
                  onClick={() => {
                    if (!dashboard?.latestMatch) return;
                    void requestContact(dashboard.latestMatch.id);
                  }}
                >
                  {saving === "contact" ? "发送中…" : "双方引荐联系"}
                </button>
              )}
              {(() => {
                const label = reportHandlingChipLabel(
                  dashboard?.latestMatch?.reportStatus ?? null,
                );
                return label ? (
                  <span className="domain-chip">{label}</span>
                ) : (
                  <button
                    className="button-secondary"
                    aria-controls={REPORT_FORM_SECTION_ID}
                    aria-expanded={
                      dashboard?.latestMatch
                        ? reportFormIsOpenForMatch(dashboard.latestMatch.id)
                        : false
                    }
                    disabled={saving === "report"}
                    type="button"
                    onClick={() => {
                      if (!dashboard?.latestMatch) return;
                      toggleReportForm(dashboard.latestMatch.id);
                    }}
                  >
                    举报
                  </button>
                );
              })()}
            </div>
          </>
        ) : (
          <>
            {dashboard?.currentCycle?.participationStatus === "OPTED_IN" &&
            (dashboard.currentCycle.status === "OPEN" || dashboard.currentCycle.status === "REVEAL_READY") ? (
              <>
                <h2>
                  {hasSavedQuestionnaire ? "等待本轮揭晓" : "还没有匹配结果"}
                </h2>
                <p className="dashboard-muted">
                  {hasSavedQuestionnaire
                    ? "你已填写问卷并已参加本轮。揭晓后将在此显示匹配说明与后续操作；在此前可随时展开下方问卷卡片修改资料。"
                    : "本轮揭晓后将在此显示匹配说明与后续操作。"}
                </p>
              </>
            ) : (
              <>
                <h2>
                  {hasSavedQuestionnaire ? "等待匹配" : "还没有匹配结果"}
                </h2>
                <p className="dashboard-muted">
                  {hasSavedQuestionnaire
                    ? "你已保存问卷。若尚未参加本轮，可在页面上方点击「参加本轮」；揭晓后返回此处查看结果。需要更新资料时，随时展开下方问卷修改即可。"
                    : "报名参加当前轮次并在揭晓后返回此处查看结果。"}
                </p>
              </>
            )}
          </>
        )}
      </section>

      {recentMatchHistory.length > 0 ? (
        <section className="content-panel dashboard-panel-wide">
          <p className="eyebrow">最近轮次</p>
          <h2>最近三次匹配记录</h2>
          <p className="dashboard-muted">
            按揭晓时间从新到旧排列。仅当该轮为「已匹配且完整可见」时，可使用联络或举报（与页面顶部相同的接口规则）。
          </p>
          <ul className="dashboard-history-list">
            {recentMatchHistory.map((item) => {
              const participationLabel =
                item.participationStatus === "OPTED_IN" ? "已参加" : "未参加";
              const sameAsLatestHero =
                Boolean(dashboard?.latestMatch) &&
                item.result === "MATCHED" &&
                item.visibility === "VISIBLE" &&
                item.match?.id === dashboard?.latestMatch?.id;

              return (
                <li key={item.cycleId} className="dashboard-history-card">
                  <div className="dashboard-history-card-head">
                    <h3 className="dashboard-history-title">{item.codename}</h3>
                    <p className="dashboard-muted dashboard-history-meta">
                      {formatCycleRevealAt(item.revealAt)} · {participationLabel}
                    </p>
                  </div>
                  {item.result === "NOT_PARTICIPATED" ? (
                    <p className="dashboard-muted" style={{ margin: "0.35rem 0 0" }}>
                      该轮你未报名参加。
                    </p>
                  ) : null}
                  {item.result === "UNMATCHED" ? (
                    <p className="dashboard-muted" style={{ margin: "0.35rem 0 0" }}>
                      你参加了该轮，但未匹配到对象。
                    </p>
                  ) : null}
                  {item.result === "MATCHED" && item.visibility === "LIMITED" ? (
                    <p className="dashboard-muted" style={{ margin: "0.35rem 0 0" }}>
                      {limitedHistoryExplanation(item.limitedReason)}
                    </p>
                  ) : null}
                  {item.result === "MATCHED" &&
                  item.visibility === "VISIBLE" &&
                  item.match &&
                  sameAsLatestHero ? (
                    <p className="dashboard-muted" style={{ margin: "0.35rem 0 0" }}>
                      与当前页面顶部「本轮匹配」为同一条记录，引荐与举报请使用上方操作区。
                    </p>
                  ) : null}
                  {item.result === "MATCHED" &&
                  item.visibility === "VISIBLE" &&
                  item.match &&
                  !sameAsLatestHero &&
                  user ? (
                    <div className="dashboard-history-match-body">
                      {(() => {
                        const hm = item.match;
                        const counterpartHistory =
                          hm.participants.find((p) => p.userId !== user.id) ??
                          null;
                        const introducedRow = Boolean(hm.introducedAt);
                        const rowReasons = normalizeMatchReasons(hm.reasons);
                        return (
                          <>
                            <p className="dashboard-match-score" style={{ marginTop: "0.5rem" }}>
                              匹配度：<strong>{hm.score.toFixed(1)}</strong> / 100
                            </p>
                            {!introducedRow ? (
                              <p className="dashboard-muted">
                                未引荐前不展示对方学校、昵称等可识别信息。
                              </p>
                            ) : null}
                            {introducedRow && counterpartHistory?.email ? (
                              <p className="form-success dashboard-match-email">
                                联络邮箱：{counterpartHistory.email}
                              </p>
                            ) : null}
                            {introducedRow && counterpartHistory?.introLine ? (
                              <p className="dashboard-muted dashboard-match-intro">
                                对方介绍：{counterpartHistory.introLine}
                              </p>
                            ) : null}
                            {rowReasons.length > 0 ? (
                              <ul className="reason-list" style={{ marginTop: "0.5rem" }}>
                                {rowReasons.map((reason, ri) => (
                                  <li key={`${item.cycleId}-${ri}-${reason.slice(0, 32)}`}>
                                    {reason}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                            <div className="auth-actions" style={{ marginTop: "0.75rem" }}>
                              {introducedRow ? (
                                <span className="domain-chip">已引荐</span>
                              ) : (
                                <button
                                  className="button-primary"
                                  disabled={saving === "contact"}
                                  type="button"
                                  onClick={() => void requestContact(hm.id)}
                                >
                                  {saving === "contact" ? "发送中…" : "双方引荐联系"}
                                </button>
                              )}
                              {(() => {
                                const label = reportHandlingChipLabel(hm.reportStatus);
                                return label ? (
                                  <span className="domain-chip">{label}</span>
                                ) : (
                                  <button
                                    className="button-secondary"
                                    aria-controls={REPORT_FORM_SECTION_ID}
                                    aria-expanded={reportFormIsOpenForMatch(hm.id)}
                                    disabled={saving === "report"}
                                    type="button"
                                    onClick={() => {
                                      toggleReportForm(hm.id);
                                    }}
                                  >
                                    举报
                                  </button>
                                );
                              })()}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {reportOpen && reportTargetMatchId ? (
        <section
          ref={reportSectionRef}
          className="content-panel dashboard-panel-wide"
          id={REPORT_FORM_SECTION_ID}
        >
          <p className="eyebrow">举报匹配</p>
          <h2>提交举报</h2>
          <p className="dashboard-muted">
            请确认你要举报的是当前选中的这条匹配记录；提交后系统将按规则处理并可能限制相关展示。
          </p>
          <div className="report-form">
            <label>
              <span>举报原因</span>
              <select
                ref={reportReasonSelectRef}
                id={buildDashboardFieldId("report-reason")}
                name="reportReason"
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
              >
                <option value="骚扰">骚扰</option>
                <option value="冒犯内容">冒犯内容</option>
                <option value="身份异常">身份异常</option>
                <option value="恶意行为">恶意行为</option>
                <option value="其他">其他</option>
              </select>
            </label>
            <label>
              <span>补充说明（可选）</span>
              <textarea
                id={buildDashboardFieldId("report-details")}
                name="reportDetails"
                rows={3}
                value={reportDetails}
                onChange={(e) => setReportDetails(e.target.value)}
              />
            </label>
            <div className="auth-actions">
              <button
                className="button-primary"
                disabled={saving === "report"}
                type="button"
                onClick={() => void submitReport()}
              >
                {saving === "report" ? "提交中…" : "确认举报"}
              </button>
              <button
                className="button-secondary"
                disabled={saving === "report"}
                type="button"
                onClick={closeReportForm}
              >
                取消
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {/* ── Questionnaire ─────────────────────────────────── */}
      <section className="content-panel dashboard-panel-wide">
        <p className="eyebrow">问卷</p>
        <h2>客观条件与价值观</h2>
        {hasSavedQuestionnaire && !questionnaireBodyVisible ? (
          <>
            <p className="dashboard-muted">
              {hasQuestionnaireDraft
                ? <>你有一份未完成草稿。当前匹配仍按<strong>最近一次正式保存</strong>的完整问卷计算；展开后继续编辑即可。</>
                : <>问卷已保存。匹配会按你<strong>最近一次保存</strong>的内容计算；需要改答案或客观条件时，展开后即可继续编辑。</>}
            </p>
            <p className="dashboard-muted">{questionnaireStatus}</p>
            {questionnaireIncompleteMessage ? (
              <p className="form-error" role="alert">
                {questionnaireIncompleteMessage}
                {" "}
                请展开问卷，补全后系统会自动转为正式问卷。
              </p>
            ) : null}
            <button
              className="button-secondary"
              type="button"
              onClick={() => setQuestionnaireBodyVisible(true)}
            >
              展开修改问卷
            </button>
          </>
        ) : (
          <>
            <p className="dashboard-muted">
              {hasSavedQuestionnaire
                ? hasQuestionnaireDraft
                  ? "可继续修改下列内容；未完成时只会保存为草稿，补全后才会替换正式问卷。带「可多选」的项目全选等同于不限。"
                  : "可随时修改下列内容；系统会自动保存，完整版本会在后续匹配与揭晓中生效。带「可多选」的项目全选等同于不限。"
                : "填写你的基本信息和对另一半的期望，再完成价值观问卷。系统会自动保存草稿；带「可多选」的项目全选等同于不限。"}
            </p>
            <div className="dashboard-questionnaire-toolbar">
              <p className="dashboard-muted" style={{ margin: 0 }}>
                {questionnaireStatus}
              </p>
              {hasSavedQuestionnaire ? (
                <button
                  className="button-ghost"
                  type="button"
                  onClick={() => setQuestionnaireBodyVisible(false)}
                >
                  收起问卷
                </button>
              ) : null}
            </div>
            {questionnaireSaveError ? (
              <p className="form-error" role="alert">
                {questionnaireSaveError}
              </p>
            ) : null}
            {questionnaireIncompleteMessage ? (
              <p className="form-error" role="alert">
                {questionnaireIncompleteMessage}
              </p>
            ) : null}

        {/* ── 关于你 ── */}
        <div className="dash-q-group">
          <div className="dash-q-group-header">
            <span className="dash-q-group-icon dash-q-group-icon-self">我</span>
            <div>
              <h3>关于你</h3>
              <p>你的基本客观信息</p>
            </div>
          </div>
          <div className="question-list">
            <fieldset className="question-block">
              <legend>出生日期</legend>
              <div className="form-grid birth-date-grid">
                <label>
                  <span>年份</span>
                  <select id={buildDashboardFieldId("birth-year")} name="birthYear" value={hardMatchForm.birthYear} onChange={(e) => setHardMatchForm((f) => ({ ...f, birthYear: e.target.value }))}>
                    <option value="">请选择</option>
                    {BIRTH_YEAR_OPTIONS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
                  </select>
                </label>
                <label>
                  <span>月份</span>
                  <select id={buildDashboardFieldId("birth-month")} name="birthMonth" value={hardMatchForm.birthMonth} onChange={(e) => setHardMatchForm((f) => ({ ...f, birthMonth: e.target.value }))}>
                    <option value="">请选择</option>
                    {MONTH_OPTIONS.map((m) => <option key={m} value={String(m)}>{m}</option>)}
                  </select>
                </label>
                <label>
                  <span>日期</span>
                  <select id={buildDashboardFieldId("birth-day")} name="birthDay" value={hardMatchForm.birthDay} onChange={(e) => setHardMatchForm((f) => ({ ...f, birthDay: e.target.value }))}>
                    <option value="">请选择</option>
                    {birthDayOptions.map((d) => <option key={d} value={String(d)}>{d}</option>)}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="question-block">
              <legend>性别</legend>
              <div className="option-list">
                {HARD_MATCH_GENDERS.map((g, i) => (
                  <label key={g}>
                    <input checked={hardMatchForm.gender === g} id={buildDashboardFieldId("gender", i)} type="radio" name="gender" onChange={() => setHardMatchForm((f) => ({ ...f, gender: g }))} />
                    <span>{g}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="question-block">
              <legend>颜值自评</legend>
              <div className="option-list">
                {HARD_MATCH_LOOKS.map((l, i) => (
                  <label key={l}>
                    <input checked={hardMatchForm.looks === l} id={buildDashboardFieldId("looks", i)} type="radio" name="looks" onChange={() => setHardMatchForm((f) => ({ ...f, looks: l }))} />
                    <span>{l}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="question-block">
              <legend>身高（厘米）</legend>
              <select
                id={buildDashboardFieldId("height-cm")}
                name="heightCm"
                value={hardMatchForm.heightCm}
                onChange={(e) => setHardMatchForm((f) => ({ ...f, heightCm: e.target.value }))}
              >
                <option value="">请选择</option>
                {HEIGHT_OPTIONS.map((h) => <option key={h} value={String(h)}>{h} cm</option>)}
              </select>
            </fieldset>

            <fieldset className="question-block">
              <legend>昵称</legend>
              <label className="dash-one-liner-label">
                <span className="dashboard-muted">
                  昵称，引荐后会发给对方邮件，可以是真名也可以不是。
                </span>
                <input
                  id={buildDashboardFieldId("display-name")}
                  name="displayName"
                  type="text"
                  maxLength={30}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="输入你的昵称"
                />
              </label>
            </fieldset>

            <fieldset className="question-block">
              <legend>一句话介绍</legend>
              <label className="dash-one-liner-label">
                <span className="dashboard-muted">
                  用一两句话介绍你的兴趣或期待；引荐邮件中会展示给对方。请勿填写隐私敏感信息。
                </span>
                <textarea
                  id={buildDashboardFieldId("one-liner-intro")}
                  name="oneLinerIntro"
                  rows={3}
                  maxLength={HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH}
                  value={hardMatchForm.oneLinerIntro}
                  onChange={(e) =>
                    setHardMatchForm((f) => ({
                      ...f,
                      oneLinerIntro: e.target.value,
                    }))
                  }
                  placeholder="例如：喜欢徒步和电影，希望认识聊得来的朋友。"
                />
              </label>
            </fieldset>
          </div>
        </div>

        {/* ── 对方条件 ── */}
        <div className="dash-q-group">
          <div className="dash-q-group-header">
            <span className="dash-q-group-icon dash-q-group-icon-partner">TA</span>
            <div>
              <h3>对方条件</h3>
              <p>你希望匹配对象满足的条件</p>
            </div>
          </div>
          <div className="question-list">
            <fieldset className="question-block">
              <legend>希望对方的年龄范围</legend>
              <div className="form-grid">
                <label>
                  <span>年龄下限</span>
                  <select id={buildDashboardFieldId("partner-age-min")} name="partnerAgeMin" value={hardMatchForm.partnerAgeMin} onChange={(e) => setHardMatchForm((f) => ({ ...f, partnerAgeMin: e.target.value }))}>
                    {AGE_OPTIONS.map((a) => <option key={a} value={String(a)}>{a}</option>)}
                  </select>
                </label>
                <label>
                  <span>年龄上限</span>
                  <select id={buildDashboardFieldId("partner-age-max")} name="partnerAgeMax" value={hardMatchForm.partnerAgeMax} onChange={(e) => setHardMatchForm((f) => ({ ...f, partnerAgeMax: e.target.value }))}>
                    {AGE_OPTIONS.map((a) => <option key={a} value={String(a)}>{a}</option>)}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="question-block">
              <legend>希望对方的性别（可多选）</legend>
              <div className="chip-grid">
                {HARD_MATCH_GENDERS.map((g, i) => {
                  const active = hardMatchForm.partnerGenders.includes(g);
                  return (
                    <label key={g} className={active ? "chip active" : "chip"}>
                      <input checked={active} id={buildDashboardFieldId("partner-genders", i)} name="partnerGenders" type="checkbox" onChange={() => toggleHardSelection("partnerGenders", g)} />
                      <span>{g}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="question-block">
              <legend>希望对方的颜值（可多选）</legend>
              <div className="chip-grid">
                {HARD_MATCH_LOOKS.map((l, i) => {
                  const active = hardMatchForm.partnerLooks.includes(l);
                  return (
                    <label key={l} className={active ? "chip active" : "chip"}>
                      <input checked={active} id={buildDashboardFieldId("partner-looks", i)} name="partnerLooks" type="checkbox" onChange={() => toggleHardSelection("partnerLooks", l)} />
                      <span>{l}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="question-block">
              <legend>希望对方的身高范围（厘米）</legend>
              <div className="form-grid">
                <label>
                  <span>身高下限</span>
                  <select id={buildDashboardFieldId("partner-height-min")} name="partnerHeightMin" value={hardMatchForm.partnerHeightMin} onChange={(e) => setHardMatchForm((f) => ({ ...f, partnerHeightMin: e.target.value }))}>
                    {HEIGHT_OPTIONS.map((h) => <option key={h} value={String(h)}>{h} cm</option>)}
                  </select>
                </label>
                <label>
                  <span>身高上限</span>
                  <select id={buildDashboardFieldId("partner-height-max")} name="partnerHeightMax" value={hardMatchForm.partnerHeightMax} onChange={(e) => setHardMatchForm((f) => ({ ...f, partnerHeightMax: e.target.value }))}>
                    {HEIGHT_OPTIONS.map((h) => <option key={h} value={String(h)}>{h} cm</option>)}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="question-block">
              <legend>不希望对方是哪个学校的（可多选）</legend>
              <p className="dashboard-muted">选中的学校将被排除，不选则不限。</p>
              <div className="chip-grid">
                {schoolOptions.map((school, i) => {
                  const active = hardMatchForm.excludedPartnerSchools.includes(school.id);
                  return (
                    <label key={school.id} className={active ? "chip active" : "chip"}>
                      <input checked={active} id={buildDashboardFieldId("excluded-partner-schools", i)} name="excludedPartnerSchools" type="checkbox" onChange={() => toggleHardSelection("excludedPartnerSchools", school.id)} />
                      <span>{school.name}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </div>
        </div>

        {/* ── 价值观问卷 ── */}
        {questions.length > 0 && (
          <div className="dash-q-group">
            <div className="dash-q-group-header">
              <span className="dash-q-group-icon dash-q-group-icon-values">Q</span>
              <div>
                <h3>价值观问卷</h3>
                <p>共 {questions.length} 题，作为匹配算法的核心输入</p>
              </div>
            </div>
            <div className="question-list">
              {questions.map((question, questionIndex) => {
                const value = answers[question.key];
                const questionTitle = (
                  <div aria-hidden="true" className="question-block-title">
                    <span className="dash-q-num">{questionIndex + 1}</span>
                    <span>{question.prompt}</span>
                  </div>
                );

                if (question.type === "MULTI_SELECT") {
                  const selected = Array.isArray(value) ? value : [];
                  const selectionLimit = question.selectionLimit ?? null;
                  const reachedSelectionLimit =
                    selectionLimit != null && selected.length >= selectionLimit;
                  return (
                    <fieldset key={question.id} className="question-block">
                      <legend className="question-block-legend">{question.prompt}</legend>
                      {questionTitle}
                      {selectionLimit != null ? (
                        <p className="dashboard-muted">本题最多选择 {selectionLimit} 项。</p>
                      ) : null}
                      <div className="chip-grid">
                        {question.options?.map((option, optionIndex) => {
                          const active = selected.includes(option.value);
                          return (
                            <label key={option.value} className={active ? "chip active" : "chip"}>
                              <input
                                checked={active}
                                disabled={!active && reachedSelectionLimit}
                                id={buildDashboardFieldId("question", question.id, optionIndex)}
                                name={question.key}
                                type="checkbox"
                                onChange={() =>
                                  setAnswers((current) => {
                                    const cur = Array.isArray(current[question.key]) ? (current[question.key] as string[]) : [];
                                    if (active) {
                                      return {
                                        ...current,
                                        [question.key]: cur.filter((v) => v !== option.value),
                                      };
                                    }

                                    if (
                                      selectionLimit != null &&
                                      cur.length >= selectionLimit
                                    ) {
                                      return current;
                                    }

                                    return {
                                      ...current,
                                      [question.key]: [...cur, option.value],
                                    };
                                  })
                                }
                              />
                              <span>{option.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  );
                }

                return (
                  <fieldset key={question.id} className="question-block">
                    <legend className="question-block-legend">{question.prompt}</legend>
                    {questionTitle}
                    <div className="option-list">
                      {question.options?.map((option, optionIndex) => (
                        <label key={option.value}>
                          <input
                            checked={value === option.value}
                            id={buildDashboardFieldId("question", question.id, optionIndex)}
                            type="radio"
                            name={question.key}
                            onChange={() => setAnswers((current) => ({ ...current, [question.key]: option.value }))}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                );
              })}
            </div>
          </div>
        )}

          </>
        )}
      </section>
    </main>
  );
}

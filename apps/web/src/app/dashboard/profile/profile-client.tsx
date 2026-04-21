"use client";

import { takeNextAutosaveQueueItem } from "@lilink/shared";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  fetchApi,
  isApiRequestError,
  type AuthMePayload,
} from "../../../lib/api";
import {
  AGE_OPTIONS,
  BIRTH_YEAR_OPTIONS,
  HARD_MATCH_GENDERS,
  HARD_MATCH_LOOKS,
  HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH,
  HEIGHT_OPTIONS,
  MONTH_OPTIONS,
  buildDayOptions,
  hardMatchFormFromAnswers,
  schoolGenderExclusionFor,
  setSchoolGenderExclusion,
  toggleMultiSelectValue,
  type HardMatchFormState,
  type HardMatchSchoolOption,
} from "../../../lib/hard-match";
import { SubPageNav } from "../_components/SubPageNav";
import { buildDashboardFieldId } from "../_lib/format";
import {
  getQuestionnaireIncompleteMessage,
  keepCurrentQuestionAnswers,
} from "../_lib/questionnaire";
import type {
  DashboardPayload,
  Question,
  SavedQuestionnairePayload,
} from "../_lib/types";

type ProfileTab = "self" | "partner" | "values";

const PROFILE_TABS: ReadonlyArray<{ id: ProfileTab; label: string }> = [
  { id: "self", label: "关于你" },
  { id: "partner", label: "希望 TA" },
  { id: "values", label: "价值观问卷" },
];

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

type QuestionnaireAutosaveState =
  | "idle"
  | "pending"
  | "saving"
  | "draft-saved"
  | "submitted"
  | "error";

const QUESTIONNAIRE_AUTOSAVE_RETRY_DELAYS_MS = [1500, 3000, 5000, 10000];
const QUESTIONNAIRE_AUTOSAVE_MAX_RETRY_ATTEMPTS =
  QUESTIONNAIRE_AUTOSAVE_RETRY_DELAYS_MS.length;

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

function questionnaireAutosaveRetryDelayMs(attemptNumber: number) {
  const retryIndex = Math.max(0, attemptNumber - 1);
  return QUESTIONNAIRE_AUTOSAVE_RETRY_DELAYS_MS[
    Math.min(retryIndex, QUESTIONNAIRE_AUTOSAVE_RETRY_DELAYS_MS.length - 1)
  ];
}

function questionnaireAutosaveStatusText(
  saveState: QuestionnaireAutosaveState,
  hasSavedQuestionnaire: boolean,
  hasDraftQuestionnaire: boolean,
) {
  if (saveState === "pending") {
    return "检测到修改，系统即将自动保存。";
  }

  if (saveState === "saving") {
    return "正在自动保存…";
  }

  if (saveState === "error") {
    return "自动保存暂时失败，请查看下方提示。";
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

function questionnaireAutosaveShouldRetry(error: unknown) {
  if (!isApiRequestError(error)) {
    return true;
  }

  return error.status >= 500;
}

function questionnaireAutosaveFailureMessage(
  error: unknown,
  retryDelayMs: number | null,
) {
  if (isApiRequestError(error) && error.status >= 400 && error.status < 500) {
    return "当前页面数据已失效或填写内容未通过校验，请刷新页面后重试。";
  }

  return retryDelayMs == null
    ? "问卷自动保存多次失败，请检查当前填写内容后立即重试。"
    : `问卷自动保存失败，系统将在 ${Math.ceil(retryDelayMs / 1000)} 秒后自动重试。`;
}

function initiallyExpandedExcludedSchoolIds(
  schoolOptions: HardMatchSchoolOption[],
  hardMatchForm: HardMatchFormState,
) {
  return schoolOptions
    .filter((school) => {
      if (hardMatchForm.excludedPartnerSchools.includes(school.id)) {
        return true;
      }

      return schoolGenderExclusionFor(
        hardMatchForm.excludedPartnerSchoolGenders,
        school.id,
      ).length > 0;
    })
    .map((school) => school.id);
}

export function ProfileClient({
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
  const initialHardMatchForm =
    initialDraft?.hardMatchForm ??
    hardMatchFormFromAnswers(initialSubmittedAnswers, initialSchools);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(
    initialDashboard,
  );
  const [questions] = useState<Question[]>(initialQuestions);
  const [schoolOptions] = useState<HardMatchSchoolOption[]>(initialSchools);
  const [answers, setAnswers] = useState<Record<string, unknown>>(
    initialDraft?.softAnswers ??
      keepCurrentQuestionAnswers(initialQuestions, initialSubmittedAnswers),
  );
  const [hardMatchForm, setHardMatchForm] =
    useState<HardMatchFormState>(initialHardMatchForm);
  const [displayName, setDisplayName] = useState(
    initialDraft?.displayName ?? initialUser.displayName ?? "",
  );
  const [questionnaireSaveError, setQuestionnaireSaveError] = useState<
    string | null
  >(null);
  const [questionnaireSaveState, setQuestionnaireSaveState] =
    useState<QuestionnaireAutosaveState>(initialDraft ? "draft-saved" : "idle");
  const [questionnaireManualRetryTick, setQuestionnaireManualRetryTick] =
    useState(0);
  const [hasQuestionnaireDraft, setHasQuestionnaireDraft] = useState(
    Boolean(initialDraft),
  );
  const [activeTab, setActiveTab] = useState<ProfileTab>("self");
  const [expandedExcludedSchoolIds, setExpandedExcludedSchoolIds] = useState<
    string[]
  >(() => initiallyExpandedExcludedSchoolIds(initialSchools, initialHardMatchForm));
  const questionnaireAutosaveReady = useRef(false);
  const questionnaireSaveAbortRef = useRef<AbortController | null>(null);
  const questionnaireSaveInFlightRef = useRef(false);
  const questionnaireRetryTimerRef = useRef<number | null>(null);
  const questionnaireRetryAttemptRef = useRef(0);
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
        initialHardMatchForm,
        initialDraft?.displayName ?? initialUser.displayName ?? "",
      ),
    ),
  );

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

  function clearQuestionnaireRetryTimer() {
    if (questionnaireRetryTimerRef.current == null) {
      return;
    }

    window.clearTimeout(questionnaireRetryTimerRef.current);
    questionnaireRetryTimerRef.current = null;
  }

  function toggleHardSelection(
    field: "partnerGenders" | "partnerLooks",
    nextValue: string,
  ) {
    setHardMatchForm((current) => ({
      ...current,
      [field]: toggleMultiSelectValue(current[field], nextValue),
    }));
  }

  function toggleExcludedSchoolExpansion(schoolId: string) {
    setExpandedExcludedSchoolIds((current) =>
      current.includes(schoolId)
        ? current.filter((item) => item !== schoolId)
        : [...current, schoolId],
    );
  }

  function toggleExcludedPartnerSchool(schoolId: string) {
    setExpandedExcludedSchoolIds((current) =>
      current.includes(schoolId) ? current : [...current, schoolId],
    );
    setHardMatchForm((current) => {
      const isExcluded = current.excludedPartnerSchools.includes(schoolId);

      return {
        ...current,
        excludedPartnerSchools: isExcluded
          ? current.excludedPartnerSchools.filter((item) => item !== schoolId)
          : [...current.excludedPartnerSchools, schoolId],
        excludedPartnerSchoolGenders: setSchoolGenderExclusion(
          current.excludedPartnerSchoolGenders,
          schoolId,
          [],
        ),
      };
    });
  }

  function toggleExcludedPartnerSchoolGender(schoolId: string, gender: string) {
    setExpandedExcludedSchoolIds((current) =>
      current.includes(schoolId) ? current : [...current, schoolId],
    );
    setHardMatchForm((current) => {
      const currentGenders = schoolGenderExclusionFor(
        current.excludedPartnerSchoolGenders,
        schoolId,
      );
      const nextGenders = toggleMultiSelectValue(currentGenders, gender);

      if (nextGenders.length === HARD_MATCH_GENDERS.length) {
        return {
          ...current,
          excludedPartnerSchools: current.excludedPartnerSchools.includes(schoolId)
            ? current.excludedPartnerSchools
            : [...current.excludedPartnerSchools, schoolId],
          excludedPartnerSchoolGenders: setSchoolGenderExclusion(
            current.excludedPartnerSchoolGenders,
            schoolId,
            [],
          ),
        };
      }

      return {
        ...current,
        excludedPartnerSchools: current.excludedPartnerSchools.filter(
          (item) => item !== schoolId,
        ),
        excludedPartnerSchoolGenders: setSchoolGenderExclusion(
          current.excludedPartnerSchoolGenders,
          schoolId,
          nextGenders,
        ),
      };
    });
  }

  const flushQueuedQuestionnaireSave = useEffectEvent(
    async (payload: QuestionnaireSavePayload, snapshot: string) => {
      let shouldScheduleRetry = false;
      let shouldStopRetryingCurrentSnapshot = false;
      let retryDelayMs: number | null = null;

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

        clearQuestionnaireRetryTimer();
        questionnaireRetryAttemptRef.current = 0;
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

        if (
          !queuedQuestionnaireSaveRef.current ||
          queuedQuestionnaireSaveRef.current.snapshot === snapshot
        ) {
          queuedQuestionnaireSaveRef.current = { payload, snapshot };
        }

        if (questionnaireAutosaveShouldRetry(caughtError)) {
          questionnaireRetryAttemptRef.current += 1;
          if (
            questionnaireRetryAttemptRef.current <=
            QUESTIONNAIRE_AUTOSAVE_MAX_RETRY_ATTEMPTS
          ) {
            retryDelayMs = questionnaireAutosaveRetryDelayMs(
              questionnaireRetryAttemptRef.current,
            );
            shouldScheduleRetry = true;
          } else {
            shouldStopRetryingCurrentSnapshot = true;
          }
        } else {
          shouldStopRetryingCurrentSnapshot = true;
        }

        setQuestionnaireSaveState("error");
        setQuestionnaireSaveError(
          questionnaireAutosaveFailureMessage(caughtError, retryDelayMs),
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
          if (
            shouldScheduleRetry &&
            retryDelayMs != null &&
            nextQueuedSave.snapshot === snapshot
          ) {
            queuedQuestionnaireSaveRef.current = nextQueuedSave;
            clearQuestionnaireRetryTimer();
            questionnaireRetryTimerRef.current = window.setTimeout(() => {
              questionnaireRetryTimerRef.current = null;
              if (questionnaireUnmountedRef.current) {
                return;
              }

              const retrySave = takeNextAutosaveQueueItem(
                queuedQuestionnaireSaveRef.current,
                {
                  isUnmounted: questionnaireUnmountedRef.current,
                  lastSavedSnapshot: lastSavedQuestionnaireSnapshotRef.current,
                },
              );
              if (!retrySave) {
                return;
              }

              queuedQuestionnaireSaveRef.current = null;
              setQuestionnaireSaveState("pending");
              setQuestionnaireSaveError(null);
              void flushQueuedQuestionnaireSave(
                retrySave.payload,
                retrySave.snapshot,
              );
            }, retryDelayMs);
            return;
          }

          if (
            shouldStopRetryingCurrentSnapshot &&
            nextQueuedSave.snapshot === snapshot
          ) {
            clearQuestionnaireRetryTimer();
            queuedQuestionnaireSaveRef.current = null;
            return;
          }

          clearQuestionnaireRetryTimer();
          questionnaireRetryAttemptRef.current = 0;
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
      clearQuestionnaireRetryTimer();

      if (snapshot === lastSavedQuestionnaireSnapshotRef.current) {
        questionnaireRetryAttemptRef.current = 0;
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

    clearQuestionnaireRetryTimer();
    questionnaireRetryAttemptRef.current = 0;
    setQuestionnaireSaveState("pending");
    setQuestionnaireSaveError(null);

    const timeoutId = window.setTimeout(() => {
      queueQuestionnaireSave(questionnaireSavePayload, questionnaireSnapshot);
    }, 800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [questionnaireSavePayload, questionnaireSnapshot]);

  useEffect(() => {
    if (questionnaireManualRetryTick === 0) {
      return;
    }

    clearQuestionnaireRetryTimer();
    questionnaireRetryAttemptRef.current = 0;

    const retrySave =
      takeNextAutosaveQueueItem(queuedQuestionnaireSaveRef.current, {
        isUnmounted: questionnaireUnmountedRef.current,
        lastSavedSnapshot: lastSavedQuestionnaireSnapshotRef.current,
      }) ??
      (questionnaireUnmountedRef.current ||
      questionnaireSaveInFlightRef.current ||
      questionnaireSnapshot === lastSavedQuestionnaireSnapshotRef.current
        ? null
        : {
            payload: questionnaireSavePayload,
            snapshot: questionnaireSnapshot,
          });

    if (!retrySave) {
      return;
    }

    queuedQuestionnaireSaveRef.current = null;
    setQuestionnaireSaveState("pending");
    setQuestionnaireSaveError(null);
    void flushQueuedQuestionnaireSave(retrySave.payload, retrySave.snapshot);
  }, [
    questionnaireManualRetryTick,
    questionnaireSavePayload,
    questionnaireSnapshot,
  ]);

  useEffect(
    () => () => {
      questionnaireUnmountedRef.current = true;
      clearQuestionnaireRetryTimer();
      queuedQuestionnaireSaveRef.current = null;
      questionnaireSaveAbortRef.current?.abort();
    },
    [],
  );

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

  const hasSavedQuestionnaire = Boolean(dashboard?.questionnaireSubmittedAt);
  const questionnaireStatus = questionnaireAutosaveStatusText(
    questionnaireSaveState,
    hasSavedQuestionnaire,
    hasQuestionnaireDraft,
  );
  const profileStatus: { label: string; tone: "on" | "warn" } =
    !hasSavedQuestionnaire
      ? hasQuestionnaireDraft
        ? { label: "草稿中", tone: "warn" }
        : { label: "未保存", tone: "warn" }
      : hasQuestionnaireDraft
        ? { label: "已保存 · 草稿待补全", tone: "warn" }
        : { label: "已保存 · 完整", tone: "on" };

  return (
    <main className="page-shell dashboard-page">
      <SubPageNav />

      <header className="content-panel dashboard-panel-wide dashboard-panel-tight">
        <p className="eyebrow">问卷资料</p>
        <h1>客观条件与价值观</h1>
        <p className="dashboard-lede">
          {hasSavedQuestionnaire
            ? hasQuestionnaireDraft
              ? "你有一份未完成草稿；当前匹配仍按最近一次正式保存的完整问卷计算。补全后系统会自动切换到最新版本。"
              : "匹配以你最近一次正式保存的内容计算；你在这里的修改会自动保存并用于后续轮次。"
            : "在这里填写问卷资料。系统会自动保存草稿；补全全部必答项后，会自动转为正式问卷。"}
        </p>
        <span
          className={
            profileStatus.tone === "on"
              ? "dashboard-hub-card-status is-on"
              : "dashboard-hub-card-status is-warn"
          }
          style={{ marginTop: "0.55rem" }}
        >
          {profileStatus.label}
        </span>
        <p className="dashboard-muted">{questionnaireStatus}</p>
        {questionnaireSaveError ? (
          <p className="form-error">{questionnaireSaveError}</p>
        ) : null}
      </header>

      <section className="content-panel dashboard-panel-wide">
        <div className="dashboard-questionnaire-toolbar">
          <p className="dashboard-muted" style={{ margin: 0 }}>
            系统会在你停止输入片刻后自动保存当前编辑内容。
          </p>
          {questionnaireSaveError ? (
            <button
              className="button-secondary"
              type="button"
              onClick={() =>
                setQuestionnaireManualRetryTick((current) => current + 1)
              }
            >
              立即重试
            </button>
          ) : null}
        </div>
        {questionnaireIncompleteMessage ? (
          <p className="form-error" role="alert">
            {questionnaireIncompleteMessage}
          </p>
        ) : null}

        <nav aria-label="问卷分组" className="dashboard-section-tabs">
          {PROFILE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={
                tab.id === activeTab
                  ? "dashboard-section-tab is-active"
                  : "dashboard-section-tab"
              }
              aria-pressed={tab.id === activeTab}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* ── 关于你 ── */}
        {activeTab === "self" && (
        <div className="dash-q-group">
          <div className="dash-q-group-header">
            <span className="dash-q-group-icon dash-q-group-icon-self">
              我
            </span>
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
                  <select
                    id={buildDashboardFieldId("birth-year")}
                    name="birthYear"
                    value={hardMatchForm.birthYear}
                    onChange={(e) =>
                      setHardMatchForm((f) => ({
                        ...f,
                        birthYear: e.target.value,
                      }))
                    }
                  >
                    <option value="">请选择</option>
                    {BIRTH_YEAR_OPTIONS.map((y) => (
                      <option key={y} value={String(y)}>
                        {y}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>月份</span>
                  <select
                    id={buildDashboardFieldId("birth-month")}
                    name="birthMonth"
                    value={hardMatchForm.birthMonth}
                    onChange={(e) =>
                      setHardMatchForm((f) => ({
                        ...f,
                        birthMonth: e.target.value,
                      }))
                    }
                  >
                    <option value="">请选择</option>
                    {MONTH_OPTIONS.map((m) => (
                      <option key={m} value={String(m)}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>日期</span>
                  <select
                    id={buildDashboardFieldId("birth-day")}
                    name="birthDay"
                    value={hardMatchForm.birthDay}
                    onChange={(e) =>
                      setHardMatchForm((f) => ({
                        ...f,
                        birthDay: e.target.value,
                      }))
                    }
                  >
                    <option value="">请选择</option>
                    {birthDayOptions.map((d) => (
                      <option key={d} value={String(d)}>
                        {d}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="question-block">
              <legend>性别</legend>
              <div className="option-list">
                {HARD_MATCH_GENDERS.map((g, i) => (
                  <label key={g}>
                    <input
                      checked={hardMatchForm.gender === g}
                      id={buildDashboardFieldId("gender", i)}
                      type="radio"
                      name="gender"
                      onChange={() =>
                        setHardMatchForm((f) => ({ ...f, gender: g }))
                      }
                    />
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
                    <input
                      checked={hardMatchForm.looks === l}
                      id={buildDashboardFieldId("looks", i)}
                      type="radio"
                      name="looks"
                      onChange={() =>
                        setHardMatchForm((f) => ({ ...f, looks: l }))
                      }
                    />
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
                onChange={(e) =>
                  setHardMatchForm((f) => ({
                    ...f,
                    heightCm: e.target.value,
                  }))
                }
              >
                <option value="">请选择</option>
                {HEIGHT_OPTIONS.map((h) => (
                  <option key={h} value={String(h)}>
                    {h} cm
                  </option>
                ))}
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
        )}

        {/* ── 对方条件 ── */}
        {activeTab === "partner" && (
        <div className="dash-q-group">
          <div className="dash-q-group-header">
            <span className="dash-q-group-icon dash-q-group-icon-partner">
              TA
            </span>
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
                  <select
                    id={buildDashboardFieldId("partner-age-min")}
                    name="partnerAgeMin"
                    value={hardMatchForm.partnerAgeMin}
                    onChange={(e) =>
                      setHardMatchForm((f) => ({
                        ...f,
                        partnerAgeMin: e.target.value,
                      }))
                    }
                  >
                    {AGE_OPTIONS.map((a) => (
                      <option key={a} value={String(a)}>
                        {a}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>年龄上限</span>
                  <select
                    id={buildDashboardFieldId("partner-age-max")}
                    name="partnerAgeMax"
                    value={hardMatchForm.partnerAgeMax}
                    onChange={(e) =>
                      setHardMatchForm((f) => ({
                        ...f,
                        partnerAgeMax: e.target.value,
                      }))
                    }
                  >
                    {AGE_OPTIONS.map((a) => (
                      <option key={a} value={String(a)}>
                        {a}
                      </option>
                    ))}
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
                    <label
                      key={g}
                      className={active ? "chip active" : "chip"}
                    >
                      <input
                        checked={active}
                        id={buildDashboardFieldId("partner-genders", i)}
                        name="partnerGenders"
                        type="checkbox"
                        onChange={() =>
                          toggleHardSelection("partnerGenders", g)
                        }
                      />
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
                    <label
                      key={l}
                      className={active ? "chip active" : "chip"}
                    >
                      <input
                        checked={active}
                        id={buildDashboardFieldId("partner-looks", i)}
                        name="partnerLooks"
                        type="checkbox"
                        onChange={() =>
                          toggleHardSelection("partnerLooks", l)
                        }
                      />
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
                  <select
                    id={buildDashboardFieldId("partner-height-min")}
                    name="partnerHeightMin"
                    value={hardMatchForm.partnerHeightMin}
                    onChange={(e) =>
                      setHardMatchForm((f) => ({
                        ...f,
                        partnerHeightMin: e.target.value,
                      }))
                    }
                  >
                    {HEIGHT_OPTIONS.map((h) => (
                      <option key={h} value={String(h)}>
                        {h} cm
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>身高上限</span>
                  <select
                    id={buildDashboardFieldId("partner-height-max")}
                    name="partnerHeightMax"
                    value={hardMatchForm.partnerHeightMax}
                    onChange={(e) =>
                      setHardMatchForm((f) => ({
                        ...f,
                        partnerHeightMax: e.target.value,
                      }))
                    }
                  >
                    {HEIGHT_OPTIONS.map((h) => (
                      <option key={h} value={String(h)}>
                        {h} cm
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </fieldset>

            <fieldset className="question-block">
              <legend>按学校细分排除性别（可选）</legend>
              <p className="dashboard-muted">
                点开学校后，可以只排除该校里的某些性别；勾选“整校排除”则排除该校所有人。
              </p>
              <div className="school-exclusion-list">
                {schoolOptions.map((school, i) => {
                  const excludedGenders = schoolGenderExclusionFor(
                    hardMatchForm.excludedPartnerSchoolGenders,
                    school.id,
                  );
                  const isSchoolExcluded = hardMatchForm.excludedPartnerSchools.includes(
                    school.id,
                  );
                  const isExpanded = expandedExcludedSchoolIds.includes(
                    school.id,
                  );
                  const summary = isSchoolExcluded
                    ? "整校排除"
                    : excludedGenders.length > 0
                      ? `已排除：${excludedGenders.join("、")}`
                      : "未限制";
                  return (
                    <section
                      key={school.id}
                      className={
                        isSchoolExcluded || excludedGenders.length > 0
                          ? "school-exclusion-card is-active"
                          : "school-exclusion-card"
                      }
                    >
                      <button
                        type="button"
                        className="school-exclusion-summary"
                        aria-expanded={isExpanded}
                        onClick={() => toggleExcludedSchoolExpansion(school.id)}
                      >
                        <span className="school-exclusion-title">
                          {school.name}
                        </span>
                        <span className="school-exclusion-meta">
                          {summary}
                        </span>
                      </button>
                      {isExpanded ? (
                        <div className="school-exclusion-panel">
                          <label
                            className={isSchoolExcluded ? "chip active" : "chip"}
                          >
                            <input
                              checked={isSchoolExcluded}
                              id={buildDashboardFieldId(
                                "excluded-partner-school-all",
                                i,
                              )}
                              name={`excludedPartnerSchoolAll-${school.id}`}
                              type="checkbox"
                              onChange={() =>
                                toggleExcludedPartnerSchool(school.id)
                              }
                            />
                            <span>整校排除</span>
                          </label>
                          <div className="chip-grid school-exclusion-genders">
                            {HARD_MATCH_GENDERS.map((gender, genderIndex) => {
                              const active = excludedGenders.includes(gender);
                              return (
                                <label
                                  key={gender}
                                  className={
                                    active
                                      ? "chip active"
                                      : isSchoolExcluded
                                        ? "chip is-disabled"
                                        : "chip"
                                  }
                                >
                                  <input
                                    checked={active}
                                    disabled={isSchoolExcluded}
                                    id={buildDashboardFieldId(
                                      "excluded-partner-school-gender",
                                      i,
                                      genderIndex,
                                    )}
                                    name={`excludedPartnerSchoolGender-${school.id}`}
                                    type="checkbox"
                                    onChange={() =>
                                      toggleExcludedPartnerSchoolGender(
                                        school.id,
                                        gender,
                                      )
                                    }
                                  />
                                  <span>{gender}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            </fieldset>
          </div>
        </div>
        )}

        {/* ── 价值观问卷 ── */}
        {activeTab === "values" && questions.length > 0 && (
          <div className="dash-q-group">
            <div className="dash-q-group-header">
              <span className="dash-q-group-icon dash-q-group-icon-values">
                Q
              </span>
              <div>
                <h3>价值观问卷</h3>
                <p>共 {questions.length} 题，作为匹配算法的核心输入</p>
              </div>
            </div>
            <div className="question-list">
              {questions.map((question, questionIndex) => {
                const value = answers[question.key];
                const questionTitle = (
                  <div
                    aria-hidden="true"
                    className="question-block-title"
                  >
                    <span className="dash-q-num">{questionIndex + 1}</span>
                    <span>{question.prompt}</span>
                  </div>
                );

                if (question.type === "MULTI_SELECT") {
                  const selected = Array.isArray(value) ? value : [];
                  const selectionLimit = question.selectionLimit ?? null;
                  const reachedSelectionLimit =
                    selectionLimit != null &&
                    selected.length >= selectionLimit;
                  return (
                    <fieldset
                      key={question.id}
                      className="question-block"
                    >
                      <legend className="question-block-legend">
                        {question.prompt}
                      </legend>
                      {questionTitle}
                      {selectionLimit != null ? (
                        <p className="dashboard-muted">
                          本题最多选择 {selectionLimit} 项。
                        </p>
                      ) : null}
                      <div className="chip-grid">
                        {question.options?.map((option, optionIndex) => {
                          const active = selected.includes(option.value);
                          return (
                            <label
                              key={option.value}
                              className={active ? "chip active" : "chip"}
                            >
                              <input
                                checked={active}
                                disabled={
                                  !active && reachedSelectionLimit
                                }
                                id={buildDashboardFieldId(
                                  "question",
                                  question.id,
                                  optionIndex,
                                )}
                                name={question.key}
                                type="checkbox"
                                onChange={() =>
                                  setAnswers((current) => {
                                    const cur = Array.isArray(
                                      current[question.key],
                                    )
                                      ? (current[question.key] as string[])
                                      : [];
                                    if (active) {
                                      return {
                                        ...current,
                                        [question.key]: cur.filter(
                                          (v) => v !== option.value,
                                        ),
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
                                      [question.key]: [
                                        ...cur,
                                        option.value,
                                      ],
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
                    <legend className="question-block-legend">
                      {question.prompt}
                    </legend>
                    {questionTitle}
                    <div className="option-list">
                      {question.options?.map((option, optionIndex) => (
                        <label key={option.value}>
                          <input
                            checked={value === option.value}
                            id={buildDashboardFieldId(
                              "question",
                              question.id,
                              optionIndex,
                            )}
                            type="radio"
                            name={question.key}
                            onChange={() =>
                              setAnswers((current) => ({
                                ...current,
                                [question.key]: option.value,
                              }))
                            }
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
      </section>
    </main>
  );
}

"use client";

import {
  createAutosaveLifecycleGate,
  createAutosaveTimeoutController,
  takeNextAutosaveQueueItem,
  type MatchEstimateBand,
} from "@lilink/shared";
import {
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  fetchApi,
  fetchMatchEstimate,
  isApiRequestError,
  type AuthMePayload,
  type MatchEstimate,
} from "../../../lib/api";
import {
  AGE_OPTIONS,
  BIRTH_YEAR_OPTIONS,
  HARD_MATCH_KEYS,
  HARD_MATCH_GENDERS,
  HARD_MATCH_LANGUAGES,
  HARD_MATCH_LOOKS,
  HARD_MATCH_NATIONALITIES,
  HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH,
  HEIGHT_OPTIONS,
  MONTH_OPTIONS,
  WEIGHT_OPTIONS,
  buildDayOptions,
  hardMatchAttentionFields,
  hardMatchFormFromAnswers,
  schoolGenderExclusionFor,
  setSchoolGenderExclusion,
  toggleMultiSelectValue,
  type HardMatchFormState,
  type HardMatchSchoolOption,
} from "../../../lib/hard-match";
import { useDashboardSessionSeed } from "../_components/DashboardSessionSeed";
import {
  ValuePicker,
  type ValuePickerOption,
} from "../_components/ValuePicker";
import { buildDashboardFieldId } from "../_lib/format";
import {
  profileAttentionElementId,
  profileAttentionKeyFromHash,
  profileAttentionTabForKey,
} from "../_lib/profile-attention";
import {
  getQuestionnaireIncompleteMessage,
  keepCurrentQuestionAnswers,
  softQuestionAnswerIsComplete,
} from "../_lib/questionnaire";
import type {
  DashboardPayload,
  QuestionnaireAttentionItem,
  Question,
  SavedQuestionnairePayload,
} from "../_lib/types";

function numericOptions(
  values: ReadonlyArray<number | string>,
  formatter?: (value: number | string) => string,
): ValuePickerOption[] {
  return values.map((raw) => {
    const valueText = String(raw);
    return {
      value: valueText,
      label: formatter ? formatter(raw) : valueText,
    };
  });
}

const BIRTH_YEAR_VALUE_OPTIONS = numericOptions(
  BIRTH_YEAR_OPTIONS,
  (year) => `${year} 年`,
);
const MONTH_VALUE_OPTIONS = numericOptions(
  MONTH_OPTIONS,
  (month) => `${month} 月`,
);
const AGE_VALUE_OPTIONS = numericOptions(AGE_OPTIONS);
const HEIGHT_VALUE_OPTIONS = numericOptions(HEIGHT_OPTIONS);
const WEIGHT_VALUE_OPTIONS = [
  { value: "", label: "不填写" },
  ...numericOptions(WEIGHT_OPTIONS, (weight) => `${weight} kg`),
];
const PARTNER_WEIGHT_VALUE_OPTIONS = [
  { value: "", label: "不限" },
  ...numericOptions(WEIGHT_OPTIONS, (weight) => `${weight} kg`),
];
const NATIONALITY_VALUE_OPTIONS = HARD_MATCH_NATIONALITIES.map((value) => ({
  value,
  label: value,
}));
const MULTI_CHOICE_PREVIEW_LIMIT = 4;

type ProfileTab = "self" | "partner" | "values";

const PROFILE_TABS: ReadonlyArray<{ id: ProfileTab; label: string }> = [
  { id: "self", label: "关于你" },
  { id: "partner", label: "希望 TA" },
  { id: "values", label: "价值观问卷" },
];

const HARD_MATCH_FIELD_KEY_GROUPS = {
  birthDate: [HARD_MATCH_KEYS.birthDate],
  gender: [HARD_MATCH_KEYS.gender],
  nationality: [HARD_MATCH_KEYS.nationality],
  languages: [HARD_MATCH_KEYS.languages],
  looks: [HARD_MATCH_KEYS.looks],
  heightCm: [HARD_MATCH_KEYS.heightCm],
  weightKg: [HARD_MATCH_KEYS.weightKg],
  oneLinerIntro: [HARD_MATCH_KEYS.oneLinerIntro],
  partnerAge: [HARD_MATCH_KEYS.partnerAgeMin, HARD_MATCH_KEYS.partnerAgeMax],
  partnerGenders: [HARD_MATCH_KEYS.partnerGenders],
  partnerNationalities: [HARD_MATCH_KEYS.partnerNationalities],
  partnerLanguages: [HARD_MATCH_KEYS.partnerLanguages],
  partnerLooks: [HARD_MATCH_KEYS.partnerLooks],
  partnerHeight: [
    HARD_MATCH_KEYS.partnerHeightMin,
    HARD_MATCH_KEYS.partnerHeightMax,
  ],
  partnerWeight: [
    HARD_MATCH_KEYS.partnerWeightMin,
    HARD_MATCH_KEYS.partnerWeightMax,
  ],
  excludedPartnerSchools: [
    HARD_MATCH_KEYS.excludedPartnerSchools,
    HARD_MATCH_KEYS.excludedPartnerSchoolGenders,
  ],
} as const;

const MATCH_ESTIMATE_DEBOUNCE_MS = 400;

const MATCH_ESTIMATE_BAND_LABELS: Record<MatchEstimateBand, string> = {
  HIGH: "较高",
  MEDIUM: "中等",
  LOW: "较低",
  VERY_LOW: "极低",
};

const MATCH_ESTIMATE_BAND_MODIFIERS: Record<MatchEstimateBand, string> = {
  HIGH: "is-high",
  MEDIUM: "is-medium",
  LOW: "is-low",
  VERY_LOW: "is-very-low",
};

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

type QuestionnaireAcknowledgementResponse = {
  currentVersionId: string;
  acknowledgedKeys: string[];
};

type QuestionnaireAutosaveState =
  | "idle"
  | "pending"
  | "saving"
  | "draft-saved"
  | "submitted"
  | "error";

type MultiChoiceSummaryPickerProps = {
  id: string;
  name: string;
  title: string;
  values: string[];
  options: readonly string[];
  onChange: (next: string[]) => void;
  emptyLabel?: string;
  searchPlaceholder?: string;
  allowEmpty?: boolean;
};

const QUESTIONNAIRE_AUTOSAVE_RETRY_DELAYS_MS = [1500, 3000, 5000, 10000];
const QUESTIONNAIRE_AUTOSAVE_MAX_RETRY_ATTEMPTS =
  QUESTIONNAIRE_AUTOSAVE_RETRY_DELAYS_MS.length;
const QUESTIONNAIRE_AUTOSAVE_TIMEOUT_MS = 15000;
const QUESTIONNAIRE_ATTENTION_VIEW_MS = 200;
const MULTI_CHOICE_REOPEN_GUARD_MS = 350;

function questionnaireQuestionElementId(key: string) {
  return `questionnaire-question-${key}`;
}

function initialProfileTab(
  questions: Question[],
  savedQuestionnaire: SavedQuestionnairePayload,
): ProfileTab {
  const firstPendingKey = savedQuestionnaire?.attention?.pendingKeys?.[0];
  if (!firstPendingKey) {
    return "self";
  }

  return profileAttentionTabForKey(firstPendingKey, questions) ?? "self";
}

function questionnaireAttentionText(item: QuestionnaireAttentionItem) {
  if (item.updated && item.missingRequired) {
    return "本题有更新，且当前答案待补完。";
  }

  if (item.updated) {
    return "本题有更新。";
  }

  return "本题待补完。";
}

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

function activeExcludedGendersFor(
  hardMatchForm: HardMatchFormState,
  schoolId: string,
): readonly string[] {
  if (hardMatchForm.excludedPartnerSchools.includes(schoolId)) {
    return HARD_MATCH_GENDERS;
  }

  return schoolGenderExclusionFor(
    hardMatchForm.excludedPartnerSchoolGenders,
    schoolId,
  );
}

function numericFormValueIsComplete(value: string) {
  return value.trim().length > 0 && Number.isFinite(Number(value));
}

function numericRangeFormValueIsComplete(min: string, max: string) {
  return (
    numericFormValueIsComplete(min) &&
    numericFormValueIsComplete(max) &&
    Number(min) <= Number(max)
  );
}

function hardMatchFieldIsComplete(
  key: string,
  hardMatchForm: HardMatchFormState,
) {
  switch (key) {
    case HARD_MATCH_KEYS.birthDate:
      return (
        hardMatchForm.birthYear.trim().length > 0 &&
        hardMatchForm.birthMonth.trim().length > 0 &&
        hardMatchForm.birthDay.trim().length > 0 &&
        buildDayOptions(
          hardMatchForm.birthYear,
          hardMatchForm.birthMonth,
        ).includes(Number(hardMatchForm.birthDay))
      );
    case HARD_MATCH_KEYS.gender:
      return hardMatchForm.gender.trim().length > 0;
    case HARD_MATCH_KEYS.nationality:
      return hardMatchForm.nationality.trim().length > 0;
    case HARD_MATCH_KEYS.languages:
      return hardMatchForm.languages.length > 0;
    case HARD_MATCH_KEYS.looks:
      return hardMatchForm.looks.trim().length > 0;
    case HARD_MATCH_KEYS.heightCm:
      return numericFormValueIsComplete(hardMatchForm.heightCm);
    case HARD_MATCH_KEYS.weightKg:
      return true;
    case HARD_MATCH_KEYS.oneLinerIntro: {
      const oneLinerIntro = hardMatchForm.oneLinerIntro.trim();
      return (
        oneLinerIntro.length > 0 &&
        oneLinerIntro.length <= HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH
      );
    }
    case HARD_MATCH_KEYS.partnerAgeMin:
    case HARD_MATCH_KEYS.partnerAgeMax:
      return numericRangeFormValueIsComplete(
        hardMatchForm.partnerAgeMin,
        hardMatchForm.partnerAgeMax,
      );
    case HARD_MATCH_KEYS.partnerGenders:
      return hardMatchForm.partnerGenders.length > 0;
    case HARD_MATCH_KEYS.partnerNationalities:
    case HARD_MATCH_KEYS.partnerLanguages:
      return true;
    case HARD_MATCH_KEYS.partnerLooks:
      return hardMatchForm.partnerLooks.length > 0;
    case HARD_MATCH_KEYS.partnerHeightMin:
    case HARD_MATCH_KEYS.partnerHeightMax:
      return numericRangeFormValueIsComplete(
        hardMatchForm.partnerHeightMin,
        hardMatchForm.partnerHeightMax,
      );
    case HARD_MATCH_KEYS.partnerWeightMin:
    case HARD_MATCH_KEYS.partnerWeightMax:
    case HARD_MATCH_KEYS.excludedPartnerSchools:
    case HARD_MATCH_KEYS.excludedPartnerSchoolGenders:
      return true;
    default:
      return true;
  }
}

function MultiChoiceSummaryPicker({
  id,
  name,
  title,
  values,
  options,
  onChange,
  emptyLabel = "未选择",
  searchPlaceholder = "搜索",
  allowEmpty = false,
}: MultiChoiceSummaryPickerProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const reopenGuardUntilRef = useRef(0);
  const ignoreTriggerClickUntilRef = useRef(0);
  const [search, setSearch] = useState("");
  const hasSelectedValues = values.length > 0;
  const previewValues = values.slice(0, MULTI_CHOICE_PREVIEW_LIMIT);
  const hiddenSelectedCount = Math.max(
    0,
    values.length - MULTI_CHOICE_PREVIEW_LIMIT,
  );
  const filteredOptions = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return options;
    return options.filter((option) =>
      option.toLocaleLowerCase().includes(query),
    );
  }, [options, search]);

  function openDialog() {
    if (window.performance.now() < reopenGuardUntilRef.current) {
      return;
    }

    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function handleTriggerClick() {
    if (window.performance.now() < ignoreTriggerClickUntilRef.current) {
      return;
    }

    openDialog();
  }

  function handleTriggerPointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    if (event.pointerType === "mouse") {
      return;
    }

    if (window.performance.now() < ignoreTriggerClickUntilRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    ignoreTriggerClickUntilRef.current =
      window.performance.now() + MULTI_CHOICE_REOPEN_GUARD_MS;
    openDialog();
  }

  function handleTriggerTouchStart(event: ReactTouchEvent<HTMLButtonElement>) {
    if (window.performance.now() < ignoreTriggerClickUntilRef.current) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    ignoreTriggerClickUntilRef.current =
      window.performance.now() + MULTI_CHOICE_REOPEN_GUARD_MS;
    openDialog();
  }

  function closeDialog() {
    reopenGuardUntilRef.current =
      window.performance.now() + MULTI_CHOICE_REOPEN_GUARD_MS;
    dialogRef.current?.close();
  }

  function clearSelection() {
    if (!allowEmpty) return;
    onChange([]);
  }

  function toggleOption(option: string) {
    if (values.includes(option)) {
      const next = values.filter((value) => value !== option);
      if (!allowEmpty && next.length === 0) return;
      onChange(next);
      return;
    }

    const nextValues = new Set([...values, option]);
    onChange(options.filter((value) => nextValues.has(value)));
  }

  return (
    <div className="multi-choice-picker">
      <div className="multi-choice-summary">
        <div className="multi-choice-copy">
          <span className="multi-choice-count">
            {hasSelectedValues ? `已选 ${values.length} 项` : emptyLabel}
          </span>
          <div className="multi-choice-preview">
            {hasSelectedValues ? (
              <>
                {previewValues.map((value) => (
                  <span key={value} className="multi-choice-preview-chip">
                    {value}
                  </span>
                ))}
                {hiddenSelectedCount > 0 ? (
                  <span className="multi-choice-more">
                    +{hiddenSelectedCount}
                  </span>
                ) : null}
              </>
            ) : (
              <span className="multi-choice-empty">{emptyLabel}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          className="multi-choice-trigger"
          aria-haspopup="dialog"
          onClick={handleTriggerClick}
          onPointerDown={handleTriggerPointerDown}
          onTouchStart={handleTriggerTouchStart}
        >
          选择
        </button>
      </div>

      <dialog
        ref={dialogRef}
        className="multi-choice-dialog"
        aria-labelledby={`${id}-dialog-title`}
        onClose={() => setSearch("")}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeDialog();
          }
        }}
      >
        <div className="multi-choice-dialog-inner">
          <div className="multi-choice-dialog-head">
            <h4 id={`${id}-dialog-title`}>{title}</h4>
            <button
              type="button"
              className="multi-choice-dialog-close"
              aria-label="关闭"
              onClick={closeDialog}
            >
              ×
            </button>
          </div>

          <input
            ref={searchInputRef}
            type="search"
            className="multi-choice-search"
            value={search}
            placeholder={searchPlaceholder}
            onChange={(event) => setSearch(event.target.value)}
          />

          {allowEmpty ? (
            <button
              type="button"
              className={
                hasSelectedValues
                  ? "multi-choice-clear"
                  : "multi-choice-clear is-active"
              }
              onClick={clearSelection}
            >
              {emptyLabel}
            </button>
          ) : null}

          <div className="multi-choice-dialog-options">
            {filteredOptions.map((option, index) => {
              const active = values.includes(option);
              return (
                <label
                  key={option}
                  className={
                    active
                      ? "multi-choice-dialog-option is-active"
                      : "multi-choice-dialog-option"
                  }
                >
                  <input
                    id={`${id}-${index}`}
                    name={name}
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleOption(option)}
                  />
                  <span>{option}</span>
                </label>
              );
            })}
          </div>

          <div className="multi-choice-dialog-footer">
            <span>
              {hasSelectedValues ? `已选 ${values.length} 项` : emptyLabel}
            </span>
            <button
              type="button"
              className="multi-choice-done"
              onClick={closeDialog}
            >
              完成
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
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
  useDashboardSessionSeed(initialUser);

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
  const [matchEstimate, setMatchEstimate] = useState<MatchEstimate | null>(
    null,
  );
  const [matchEstimatePending, setMatchEstimatePending] = useState(false);
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
  const [activeTab, setActiveTab] = useState<ProfileTab>(() =>
    initialProfileTab(initialQuestions, initialSavedQuestionnaire),
  );
  const questionnaireAttention = initialSavedQuestionnaire?.attention ?? null;
  const [acknowledgedQuestionnaireKeys, setAcknowledgedQuestionnaireKeys] =
    useState<string[]>(() => questionnaireAttention?.acknowledgedKeys ?? []);
  const questionBlockRefs = useRef(new Map<string, HTMLFieldSetElement>());
  const questionnaireAutosaveReady = useRef(false);
  const questionnaireSaveAbortRef = useRef<AbortController | null>(null);
  const questionnaireSaveInFlightRef = useRef(false);
  const questionnaireRetryTimerRef = useRef<number | null>(null);
  const questionnaireRetryAttemptRef = useRef(0);
  const queuedQuestionnaireSaveRef = useRef<{
    payload: QuestionnaireSavePayload;
    snapshot: string;
  } | null>(null);
  const [questionnaireAutosaveLifecycle] = useState(
    createAutosaveLifecycleGate,
  );
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

  // Live, debounced match-odds estimate for the current partner exclusions.
  // Only availability and the band return from the server; raw pool counts stay
  // server-side.
  useEffect(() => {
    let active = true;
    const handle = window.setTimeout(() => {
      if (active) setMatchEstimatePending(true);
      fetchMatchEstimate({
        excludedPartnerSchools: hardMatchForm.excludedPartnerSchools,
        excludedPartnerSchoolGenders:
          hardMatchForm.excludedPartnerSchoolGenders,
      })
        .then((result) => {
          if (active) setMatchEstimate(result.available ? result : null);
        })
        .catch(() => {
          if (active) setMatchEstimate(null);
        })
        .finally(() => {
          if (active) setMatchEstimatePending(false);
        });
    }, MATCH_ESTIMATE_DEBOUNCE_MS);
    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [
    hardMatchForm.excludedPartnerSchools,
    hardMatchForm.excludedPartnerSchoolGenders,
  ]);

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

  useEffect(() => {
    questionnaireAutosaveLifecycle.markMounted();

    return () => {
      questionnaireAutosaveLifecycle.markUnmounted();
      clearQuestionnaireRetryTimer();
      queuedQuestionnaireSaveRef.current = null;
      questionnaireSaveAbortRef.current?.abort();
    };
  }, [questionnaireAutosaveLifecycle]);

  function toggleHardSelection(
    field: "partnerGenders" | "partnerLooks",
    nextValue: string,
  ) {
    setHardMatchForm((current) => ({
      ...current,
      [field]: toggleMultiSelectValue(current[field], nextValue),
    }));
  }

  function toggleExcludedPartnerSchoolGender(schoolId: string, gender: string) {
    setHardMatchForm((current) => {
      const currentActive = activeExcludedGendersFor(current, schoolId);
      const nextActive = toggleMultiSelectValue([...currentActive], gender);
      const isNowFullyExcluded =
        nextActive.length === HARD_MATCH_GENDERS.length;
      const baseSchools = current.excludedPartnerSchools.filter(
        (item) => item !== schoolId,
      );

      return {
        ...current,
        excludedPartnerSchools: isNowFullyExcluded
          ? [...baseSchools, schoolId]
          : baseSchools,
        excludedPartnerSchoolGenders: setSchoolGenderExclusion(
          current.excludedPartnerSchoolGenders,
          schoolId,
          isNowFullyExcluded ? [] : nextActive,
        ),
      };
    });
  }

  const questionAttentionByKey = useMemo(() => {
    const acknowledgedKeys = new Set(acknowledgedQuestionnaireKeys);
    const attentionByKey = new Map<string, QuestionnaireAttentionItem>();

    for (const item of questionnaireAttention?.items ?? []) {
      attentionByKey.set(item.key, {
        ...item,
        acknowledged: !item.updated || acknowledgedKeys.has(item.key),
      });
    }

    for (const field of hardMatchAttentionFields()) {
      const current = attentionByKey.get(field.key);
      const missingRequired =
        field.required && !hardMatchFieldIsComplete(field.key, hardMatchForm);

      if (!missingRequired && !current?.updated) {
        attentionByKey.delete(field.key);
        continue;
      }

      if (!missingRequired && current) {
        attentionByKey.set(field.key, {
          ...current,
          missingRequired: false,
          acknowledged: !current.updated || acknowledgedKeys.has(field.key),
        });
        continue;
      }

      if (missingRequired) {
        attentionByKey.set(field.key, {
          key: field.key,
          prompt: current?.prompt ?? field.label,
          updated: current?.updated ?? false,
          missingRequired: true,
          acknowledged: current?.updated
            ? acknowledgedKeys.has(field.key)
            : true,
        });
      }
    }

    for (const question of questions) {
      const missingRequired =
        question.required !== false &&
        !softQuestionAnswerIsComplete(question, answers[question.key]);

      if (!missingRequired) {
        continue;
      }

      const current = attentionByKey.get(question.key);
      attentionByKey.set(question.key, {
        key: question.key,
        prompt: question.prompt,
        updated: current?.updated ?? false,
        missingRequired: true,
        acknowledged: current?.updated
          ? acknowledgedKeys.has(question.key)
          : true,
      });
    }

    return attentionByKey;
  }, [
    acknowledgedQuestionnaireKeys,
    answers,
    hardMatchForm,
    questionnaireAttention,
    questions,
  ]);

  const pendingUpdatedAttentionKeys = useMemo(
    () =>
      [...questionAttentionByKey.values()]
        .filter((item) => item.updated && !item.acknowledged)
        .map((item) => item.key),
    [questionAttentionByKey],
  );

  function setAttentionBlockRef(
    keys: readonly string[],
    node: HTMLFieldSetElement | null,
  ) {
    if (node) {
      for (const key of keys) {
        questionBlockRefs.current.set(key, node);
      }
      return;
    }

    for (const key of keys) {
      questionBlockRefs.current.delete(key);
    }
  }

  function attentionItemForKeys(keys: readonly string[]) {
    return (
      keys
        .map((key) => questionAttentionByKey.get(key))
        .find(
          (item) =>
            item != null &&
            (item.missingRequired || (item.updated && !item.acknowledged)),
        ) ?? null
    );
  }

  function attentionBlockClassName(keys: readonly string[]) {
    return attentionItemForKeys(keys)
      ? "question-block question-block-attention"
      : "question-block";
  }

  function renderAttentionNote(keys: readonly string[]) {
    const item = attentionItemForKeys(keys);
    return item ? (
      <p className="question-attention-note">
        {questionnaireAttentionText(item)}
      </p>
    ) : null;
  }

  const acknowledgeQuestionnaireKeys = useEffectEvent(
    async (keys: string[]) => {
      if (!questionnaireAttention || keys.length === 0) {
        return;
      }

      try {
        const result = await fetchApi<QuestionnaireAcknowledgementResponse>(
          "/me/questionnaire/acknowledgement",
          {
            method: "PUT",
            body: JSON.stringify({
              versionId: questionnaireAttention.currentVersionId,
              keys,
            }),
          },
        );

        if (!questionnaireAutosaveLifecycle.isUnmounted()) {
          setAcknowledgedQuestionnaireKeys(result.acknowledgedKeys);
        }
      } catch {
        // Keep the marker visible; the next viewport pass can retry.
      }
    },
  );

  useEffect(() => {
    const attentionHash = window.location.hash;
    const key = profileAttentionKeyFromHash(attentionHash);
    if (!key) {
      return;
    }

    const targetTab = profileAttentionTabForKey(key, questions);
    if (!targetTab) {
      return;
    }

    if (activeTab !== targetTab) {
      setActiveTab(targetTab);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const target =
        questionBlockRefs.current.get(key) ??
        document.getElementById(profileAttentionElementId(key)) ??
        document.getElementById(questionnaireQuestionElementId(key));
      target?.scrollIntoView({ block: "center" });

      if (target && window.location.hash === attentionHash) {
        window.history.replaceState(
          window.history.state,
          "",
          `${window.location.pathname}${window.location.search}`,
        );
      }
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeTab, questions]);

  useEffect(() => {
    if (
      !questionnaireAttention ||
      pendingUpdatedAttentionKeys.length === 0 ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const timers = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const keys = pendingUpdatedAttentionKeys.filter(
            (key) => questionBlockRefs.current.get(key) === entry.target,
          );
          if (keys.length === 0) {
            continue;
          }
          const timerKey = keys.join("\u0000");

          if (!entry.isIntersecting) {
            const timer = timers.get(timerKey);
            if (timer != null) {
              window.clearTimeout(timer);
              timers.delete(timerKey);
            }
            continue;
          }

          if (timers.has(timerKey)) {
            continue;
          }

          const timeoutId = window.setTimeout(() => {
            timers.delete(timerKey);
            observer.unobserve(entry.target);
            void acknowledgeQuestionnaireKeys(keys);
          }, QUESTIONNAIRE_ATTENTION_VIEW_MS);
          timers.set(timerKey, timeoutId);
        }
      },
      { threshold: 0.35 },
    );

    const observedNodes = new Set<HTMLFieldSetElement>();
    for (const key of pendingUpdatedAttentionKeys) {
      const node = questionBlockRefs.current.get(key);
      if (node && !observedNodes.has(node)) {
        observedNodes.add(node);
        observer.observe(node);
      }
    }

    return () => {
      observer.disconnect();
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }
    };
  }, [activeTab, pendingUpdatedAttentionKeys, questionnaireAttention]);

  const flushQueuedQuestionnaireSave = useEffectEvent(
    async (payload: QuestionnaireSavePayload, snapshot: string) => {
      let shouldScheduleRetry = false;
      let shouldStopRetryingCurrentSnapshot = false;
      let retryDelayMs: number | null = null;
      const lifecycleToken = questionnaireAutosaveLifecycle.currentToken();

      if (
        !questionnaireAutosaveLifecycle.isTokenActive(lifecycleToken) ||
        questionnaireSaveInFlightRef.current ||
        snapshot === lastSavedQuestionnaireSnapshotRef.current
      ) {
        return;
      }

      const autosaveTimeout = createAutosaveTimeoutController(
        QUESTIONNAIRE_AUTOSAVE_TIMEOUT_MS,
      );

      questionnaireSaveInFlightRef.current = true;
      questionnaireSaveAbortRef.current = autosaveTimeout.controller;
      setQuestionnaireSaveState("saving");
      setQuestionnaireSaveError(null);

      try {
        const result = await fetchApi<QuestionnaireSaveResponse>(
          "/me/questionnaire",
          {
            method: "PUT",
            body: JSON.stringify(payload),
            signal: autosaveTimeout.signal,
          },
        );

        if (!questionnaireAutosaveLifecycle.isTokenActive(lifecycleToken)) {
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
        if (result.saveState === "SUBMITTED") {
          setAcknowledgedQuestionnaireKeys(
            questions.map((question) => question.key),
          );
        }
        setQuestionnaireSaveState(
          result.saveState === "SUBMITTED" ? "submitted" : "draft-saved",
        );
      } catch (caughtError) {
        if (!questionnaireAutosaveLifecycle.isTokenActive(lifecycleToken)) {
          return;
        }

        if (
          caughtError instanceof Error &&
          caughtError.name === "AbortError" &&
          !autosaveTimeout.hasTimedOut()
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
        autosaveTimeout.clear();
        questionnaireSaveAbortRef.current = null;
        questionnaireSaveInFlightRef.current = false;

        const nextQueuedSave = takeNextAutosaveQueueItem(
          queuedQuestionnaireSaveRef.current,
          {
            isUnmounted: questionnaireAutosaveLifecycle.isUnmounted(),
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
              if (questionnaireAutosaveLifecycle.isUnmounted()) {
                return;
              }

              const retrySave = takeNextAutosaveQueueItem(
                queuedQuestionnaireSaveRef.current,
                {
                  isUnmounted: questionnaireAutosaveLifecycle.isUnmounted(),
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
        // A concurrent save already persisted this snapshot; clear stale indicator.
        setQuestionnaireSaveState((current) =>
          current === "pending" || current === "error" ? "idle" : current,
        );
        setQuestionnaireSaveError(null);
        return;
      }

      if (questionnaireSaveInFlightRef.current) {
        queuedQuestionnaireSaveRef.current = { payload, snapshot };
        setQuestionnaireSaveState("saving");
        setQuestionnaireSaveError(null);
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
      // Snapshot reverted to the last-saved state (user undid a change).
      // Clear any stale "pending" or "error" indicator that was set before
      // the timer could fire, so the UI doesn't stay frozen on a false alarm.
      setQuestionnaireSaveState((current) =>
        current === "pending" || current === "error" ? "idle" : current,
      );
      setQuestionnaireSaveError(null);
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
        isUnmounted: questionnaireAutosaveLifecycle.isUnmounted(),
        lastSavedSnapshot: lastSavedQuestionnaireSnapshotRef.current,
      }) ??
      (questionnaireAutosaveLifecycle.isUnmounted() ||
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
    questionnaireAutosaveLifecycle,
    questionnaireSavePayload,
    questionnaireSnapshot,
  ]);

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
    <div className="app-page-shell v2-page-shell">
      <header className="v2-page-header">
        <span className="v2-page-header-eyebrow">Matching Profile</span>
        <h1>匹配资料</h1>
        <p>
          {hasSavedQuestionnaire
            ? hasQuestionnaireDraft
              ? "你有一份未完成草稿；当前匹配仍按最近一次正式保存的完整问卷计算。补全后系统会自动切换到最新版本。"
              : "匹配以你最近一次正式保存的内容计算；你在这里的修改会自动保存并用于后续轮次。"
            : "在这里填写匹配资料。系统会自动保存草稿；补全全部必答项后，会自动转为正式资料。"}
        </p>
        <div className="v2-page-header-row">
          <span
            className={
              profileStatus.tone === "on"
                ? "app-card-status is-on"
                : "app-card-status is-warn"
            }
          >
            {profileStatus.label}
          </span>
          <span className="app-card-status">{questionnaireStatus}</span>
        </div>
        {questionnaireSaveError ? (
          <p className="form-error">{questionnaireSaveError}</p>
        ) : null}
      </header>

      <section className="app-card">
        <div className="app-q-toolbar">
          <p className="app-muted">
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

        <nav aria-label="问卷分组" className="app-section-tabs">
          {PROFILE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={
                tab.id === activeTab
                  ? "app-section-tab is-active"
                  : "app-section-tab"
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
          <div className="app-q-group">
            <div className="app-q-group-header">
              <span className="app-q-group-icon app-q-group-icon-self">我</span>
              <div>
                <h3>关于你</h3>
                <p>你的基本客观信息</p>
              </div>
            </div>
            <div className="question-list">
              <fieldset
                id={profileAttentionElementId(HARD_MATCH_KEYS.birthDate)}
                ref={(node) =>
                  setAttentionBlockRef(
                    HARD_MATCH_FIELD_KEY_GROUPS.birthDate,
                    node,
                  )
                }
                className={attentionBlockClassName(
                  HARD_MATCH_FIELD_KEY_GROUPS.birthDate,
                )}
              >
                <legend>出生日期</legend>
                {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.birthDate)}
                <div className="form-grid birth-date-grid">
                  <label>
                    <span>年份</span>
                    <ValuePicker
                      id={buildDashboardFieldId("birth-year")}
                      name="birthYear"
                      value={hardMatchForm.birthYear}
                      options={BIRTH_YEAR_VALUE_OPTIONS}
                      placeholder="请选择"
                      sheetTitle="选择出生年份"
                      onChange={(next) =>
                        setHardMatchForm((f) => ({ ...f, birthYear: next }))
                      }
                    />
                  </label>
                  <label>
                    <span>月份</span>
                    <ValuePicker
                      id={buildDashboardFieldId("birth-month")}
                      name="birthMonth"
                      value={hardMatchForm.birthMonth}
                      options={MONTH_VALUE_OPTIONS}
                      placeholder="请选择"
                      sheetTitle="选择出生月份"
                      onChange={(next) =>
                        setHardMatchForm((f) => ({ ...f, birthMonth: next }))
                      }
                    />
                  </label>
                  <label>
                    <span>日期</span>
                    <ValuePicker
                      id={buildDashboardFieldId("birth-day")}
                      name="birthDay"
                      value={hardMatchForm.birthDay}
                      options={numericOptions(
                        birthDayOptions,
                        (d) => `${d} 日`,
                      )}
                      placeholder="请选择"
                      sheetTitle="选择出生日期"
                      onChange={(next) =>
                        setHardMatchForm((f) => ({ ...f, birthDay: next }))
                      }
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset
                id={profileAttentionElementId(HARD_MATCH_KEYS.gender)}
                ref={(node) =>
                  setAttentionBlockRef(HARD_MATCH_FIELD_KEY_GROUPS.gender, node)
                }
                className={attentionBlockClassName(
                  HARD_MATCH_FIELD_KEY_GROUPS.gender,
                )}
              >
                <legend>性别</legend>
                {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.gender)}
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

              <fieldset
                id={profileAttentionElementId(HARD_MATCH_KEYS.nationality)}
                ref={(node) =>
                  setAttentionBlockRef(
                    HARD_MATCH_FIELD_KEY_GROUPS.nationality,
                    node,
                  )
                }
                className={attentionBlockClassName(
                  HARD_MATCH_FIELD_KEY_GROUPS.nationality,
                )}
              >
                <legend>国籍</legend>
                {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.nationality)}
                <ValuePicker
                  id={buildDashboardFieldId("nationality")}
                  name="nationality"
                  value={hardMatchForm.nationality}
                  options={NATIONALITY_VALUE_OPTIONS}
                  placeholder="请选择国籍"
                  sheetTitle="选择你的国籍"
                  onChange={(next) =>
                    setHardMatchForm((f) => ({ ...f, nationality: next }))
                  }
                />
              </fieldset>

              <fieldset
                id={profileAttentionElementId(HARD_MATCH_KEYS.languages)}
                ref={(node) =>
                  setAttentionBlockRef(
                    HARD_MATCH_FIELD_KEY_GROUPS.languages,
                    node,
                  )
                }
                className={attentionBlockClassName(
                  HARD_MATCH_FIELD_KEY_GROUPS.languages,
                )}
              >
                <legend>语言（可多选）</legend>
                {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.languages)}
                <MultiChoiceSummaryPicker
                  id={buildDashboardFieldId("languages")}
                  name="languages"
                  title="选择语言"
                  values={hardMatchForm.languages}
                  options={HARD_MATCH_LANGUAGES}
                  emptyLabel="请选择至少一种"
                  searchPlaceholder="搜索语言"
                  onChange={(next) =>
                    setHardMatchForm((f) => ({ ...f, languages: next }))
                  }
                />
              </fieldset>

              <fieldset
                id={profileAttentionElementId(HARD_MATCH_KEYS.looks)}
                ref={(node) =>
                  setAttentionBlockRef(HARD_MATCH_FIELD_KEY_GROUPS.looks, node)
                }
                className={attentionBlockClassName(
                  HARD_MATCH_FIELD_KEY_GROUPS.looks,
                )}
              >
                <legend>颜值自评</legend>
                {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.looks)}
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

              <fieldset
                id={profileAttentionElementId(HARD_MATCH_KEYS.heightCm)}
                ref={(node) =>
                  setAttentionBlockRef(
                    HARD_MATCH_FIELD_KEY_GROUPS.heightCm,
                    node,
                  )
                }
                className={attentionBlockClassName(
                  HARD_MATCH_FIELD_KEY_GROUPS.heightCm,
                )}
              >
                <legend>身高（厘米）</legend>
                {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.heightCm)}
                <ValuePicker
                  id={buildDashboardFieldId("height-cm")}
                  name="heightCm"
                  value={hardMatchForm.heightCm}
                  options={HEIGHT_VALUE_OPTIONS}
                  suffix="cm"
                  placeholder="请选择身高"
                  sheetTitle="选择你的身高"
                  onChange={(next) =>
                    setHardMatchForm((f) => ({ ...f, heightCm: next }))
                  }
                />
              </fieldset>

              <fieldset
                id={profileAttentionElementId(HARD_MATCH_KEYS.weightKg)}
                ref={(node) =>
                  setAttentionBlockRef(
                    HARD_MATCH_FIELD_KEY_GROUPS.weightKg,
                    node,
                  )
                }
                className={attentionBlockClassName(
                  HARD_MATCH_FIELD_KEY_GROUPS.weightKg,
                )}
              >
                <legend>体重（公斤）</legend>
                {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.weightKg)}
                <ValuePicker
                  id={buildDashboardFieldId("weight-kg")}
                  name="weightKg"
                  value={hardMatchForm.weightKg}
                  options={WEIGHT_VALUE_OPTIONS}
                  placeholder="不填写"
                  sheetTitle="选择你的体重"
                  onChange={(next) =>
                    setHardMatchForm((f) => ({ ...f, weightKg: next }))
                  }
                />
              </fieldset>

              <fieldset
                id={profileAttentionElementId(HARD_MATCH_KEYS.oneLinerIntro)}
                ref={(node) =>
                  setAttentionBlockRef(
                    HARD_MATCH_FIELD_KEY_GROUPS.oneLinerIntro,
                    node,
                  )
                }
                className={attentionBlockClassName(
                  HARD_MATCH_FIELD_KEY_GROUPS.oneLinerIntro,
                )}
              >
                <legend>一句话介绍</legend>
                {renderAttentionNote(
                  HARD_MATCH_FIELD_KEY_GROUPS.oneLinerIntro,
                )}
                <p className="app-muted">
                  兴趣或期待，请勿填写隐私敏感信息。
                </p>
                <textarea
                  id={buildDashboardFieldId("one-liner-intro")}
                  name="oneLinerIntro"
                  rows={3}
                  maxLength={HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH}
                  value={hardMatchForm.oneLinerIntro}
                  onChange={(event) =>
                    setHardMatchForm((f) => ({
                      ...f,
                      oneLinerIntro: event.target.value,
                    }))
                  }
                  placeholder="例如：喜欢徒步和电影，希望认识聊得来的朋友。"
                />
                <p className="app-muted">
                  {hardMatchForm.oneLinerIntro.length}/
                  {HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH}
                </p>
              </fieldset>

            </div>
          </div>
        )}

        {/* ── 对方条件 ── */}
        {activeTab === "partner" && (
          <div className="app-q-group">
            <div className="app-q-group-header">
              <span className="app-q-group-icon app-q-group-icon-partner">
                TA
              </span>
              <div>
                <h3>对方条件</h3>
                <p>你希望匹配对象满足的条件</p>
              </div>
            </div>
            <div className="question-list">
              <fieldset
                id={profileAttentionElementId(HARD_MATCH_KEYS.partnerAgeMin)}
                ref={(node) =>
                  setAttentionBlockRef(
                    HARD_MATCH_FIELD_KEY_GROUPS.partnerAge,
                    node,
                  )
                }
                className={attentionBlockClassName(
                  HARD_MATCH_FIELD_KEY_GROUPS.partnerAge,
                )}
              >
                <legend>对方年龄理想区间</legend>
                {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.partnerAge)}
                <p className="app-muted">
                  填对方的<strong>实际年龄</strong>数字（例如 18 到 25），
                  不是与你的年龄差。
                </p>
                <div className="form-grid">
                  <label>
                    <span>年龄下限</span>
                    <ValuePicker
                      id={buildDashboardFieldId("partner-age-min")}
                      name="partnerAgeMin"
                      value={hardMatchForm.partnerAgeMin}
                      options={AGE_VALUE_OPTIONS}
                      suffix="岁"
                      placeholder="请选择"
                      sheetTitle="对方年龄下限"
                      onChange={(next) =>
                        setHardMatchForm((f) => ({ ...f, partnerAgeMin: next }))
                      }
                    />
                  </label>
                  <label>
                    <span>年龄上限</span>
                    <ValuePicker
                      id={buildDashboardFieldId("partner-age-max")}
                      name="partnerAgeMax"
                      value={hardMatchForm.partnerAgeMax}
                      options={AGE_VALUE_OPTIONS}
                      suffix="岁"
                      placeholder="请选择"
                      sheetTitle="对方年龄上限"
                      onChange={(next) =>
                        setHardMatchForm((f) => ({ ...f, partnerAgeMax: next }))
                      }
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset
                id={profileAttentionElementId(HARD_MATCH_KEYS.partnerGenders)}
                ref={(node) =>
                  setAttentionBlockRef(
                    HARD_MATCH_FIELD_KEY_GROUPS.partnerGenders,
                    node,
                  )
                }
                className={attentionBlockClassName(
                  HARD_MATCH_FIELD_KEY_GROUPS.partnerGenders,
                )}
              >
                <legend>希望对方的性别（可多选）</legend>
                {renderAttentionNote(
                  HARD_MATCH_FIELD_KEY_GROUPS.partnerGenders,
                )}
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

              <fieldset
                id={profileAttentionElementId(
                  HARD_MATCH_KEYS.partnerNationalities,
                )}
                ref={(node) =>
                  setAttentionBlockRef(
                    HARD_MATCH_FIELD_KEY_GROUPS.partnerNationalities,
                    node,
                  )
                }
                className={attentionBlockClassName(
                  HARD_MATCH_FIELD_KEY_GROUPS.partnerNationalities,
                )}
              >
                <legend>希望对方的国籍</legend>
                {renderAttentionNote(
                  HARD_MATCH_FIELD_KEY_GROUPS.partnerNationalities,
                )}
                <MultiChoiceSummaryPicker
                  id={buildDashboardFieldId("partner-nationalities")}
                  name="partnerNationalities"
                  title="选择希望对方的国籍"
                  values={hardMatchForm.partnerNationalities}
                  options={HARD_MATCH_NATIONALITIES}
                  emptyLabel="不限"
                  searchPlaceholder="搜索国籍"
                  allowEmpty
                  onChange={(next) =>
                    setHardMatchForm((f) => ({
                      ...f,
                      partnerNationalities: next,
                    }))
                  }
                />
              </fieldset>

              <fieldset
                id={profileAttentionElementId(HARD_MATCH_KEYS.partnerLanguages)}
                ref={(node) =>
                  setAttentionBlockRef(
                    HARD_MATCH_FIELD_KEY_GROUPS.partnerLanguages,
                    node,
                  )
                }
                className={attentionBlockClassName(
                  HARD_MATCH_FIELD_KEY_GROUPS.partnerLanguages,
                )}
              >
                <legend>希望对方的语言</legend>
                {renderAttentionNote(
                  HARD_MATCH_FIELD_KEY_GROUPS.partnerLanguages,
                )}
                <MultiChoiceSummaryPicker
                  id={buildDashboardFieldId("partner-languages")}
                  name="partnerLanguages"
                  title="选择希望对方的语言"
                  values={hardMatchForm.partnerLanguages}
                  options={HARD_MATCH_LANGUAGES}
                  emptyLabel="不限"
                  searchPlaceholder="搜索语言"
                  allowEmpty
                  onChange={(next) =>
                    setHardMatchForm((f) => ({
                      ...f,
                      partnerLanguages: next,
                    }))
                  }
                />
              </fieldset>

              <fieldset
                id={profileAttentionElementId(HARD_MATCH_KEYS.partnerLooks)}
                ref={(node) =>
                  setAttentionBlockRef(
                    HARD_MATCH_FIELD_KEY_GROUPS.partnerLooks,
                    node,
                  )
                }
                className={attentionBlockClassName(
                  HARD_MATCH_FIELD_KEY_GROUPS.partnerLooks,
                )}
              >
                <legend>希望对方的颜值（可多选）</legend>
                {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.partnerLooks)}
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

              <fieldset
                id={profileAttentionElementId(HARD_MATCH_KEYS.partnerHeightMin)}
                ref={(node) =>
                  setAttentionBlockRef(
                    HARD_MATCH_FIELD_KEY_GROUPS.partnerHeight,
                    node,
                  )
                }
                className={attentionBlockClassName(
                  HARD_MATCH_FIELD_KEY_GROUPS.partnerHeight,
                )}
              >
                <legend>希望对方的身高范围（厘米）</legend>
                {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.partnerHeight)}
                <div className="form-grid">
                  <label>
                    <span>身高下限</span>
                    <ValuePicker
                      id={buildDashboardFieldId("partner-height-min")}
                      name="partnerHeightMin"
                      value={hardMatchForm.partnerHeightMin}
                      options={HEIGHT_VALUE_OPTIONS}
                      suffix="cm"
                      placeholder="请选择"
                      sheetTitle="希望对方身高下限"
                      onChange={(next) =>
                        setHardMatchForm((f) => ({
                          ...f,
                          partnerHeightMin: next,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>身高上限</span>
                    <ValuePicker
                      id={buildDashboardFieldId("partner-height-max")}
                      name="partnerHeightMax"
                      value={hardMatchForm.partnerHeightMax}
                      options={HEIGHT_VALUE_OPTIONS}
                      suffix="cm"
                      placeholder="请选择"
                      sheetTitle="希望对方身高上限"
                      onChange={(next) =>
                        setHardMatchForm((f) => ({
                          ...f,
                          partnerHeightMax: next,
                        }))
                      }
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset
                id={profileAttentionElementId(HARD_MATCH_KEYS.partnerWeightMin)}
                ref={(node) =>
                  setAttentionBlockRef(
                    HARD_MATCH_FIELD_KEY_GROUPS.partnerWeight,
                    node,
                  )
                }
                className={attentionBlockClassName(
                  HARD_MATCH_FIELD_KEY_GROUPS.partnerWeight,
                )}
              >
                <legend>希望对方的体重范围（公斤）</legend>
                {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.partnerWeight)}
                <div className="form-grid">
                  <label>
                    <span>体重下限</span>
                    <ValuePicker
                      id={buildDashboardFieldId("partner-weight-min")}
                      name="partnerWeightMin"
                      value={hardMatchForm.partnerWeightMin}
                      options={PARTNER_WEIGHT_VALUE_OPTIONS}
                      placeholder="不限"
                      sheetTitle="希望对方体重下限"
                      onChange={(next) =>
                        setHardMatchForm((f) => ({
                          ...f,
                          partnerWeightMin: next,
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>体重上限</span>
                    <ValuePicker
                      id={buildDashboardFieldId("partner-weight-max")}
                      name="partnerWeightMax"
                      value={hardMatchForm.partnerWeightMax}
                      options={PARTNER_WEIGHT_VALUE_OPTIONS}
                      placeholder="不限"
                      sheetTitle="希望对方体重上限"
                      onChange={(next) =>
                        setHardMatchForm((f) => ({
                          ...f,
                          partnerWeightMax: next,
                        }))
                      }
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset
                id={profileAttentionElementId(
                  HARD_MATCH_KEYS.excludedPartnerSchools,
                )}
                ref={(node) =>
                  setAttentionBlockRef(
                    HARD_MATCH_FIELD_KEY_GROUPS.excludedPartnerSchools,
                    node,
                  )
                }
                className={attentionBlockClassName(
                  HARD_MATCH_FIELD_KEY_GROUPS.excludedPartnerSchools,
                )}
              >
                <legend>按学校排除（可选）</legend>
                {renderAttentionNote(
                  HARD_MATCH_FIELD_KEY_GROUPS.excludedPartnerSchools,
                )}
                <p className="app-muted">
                  在每所学校上，勾选你不希望匹配的性别。三项全选即整校排除。
                </p>
                {matchEstimate ? (
                  <p
                    className={`match-estimate-hint ${MATCH_ESTIMATE_BAND_MODIFIERS[matchEstimate.band]}${matchEstimatePending ? " is-pending" : ""}`}
                    role="status"
                    aria-live="polite"
                  >
                    <span className="match-estimate-hint-label">
                      排除后匹配到的概率：
                    </span>
                    <strong className="match-estimate-hint-band">
                      {MATCH_ESTIMATE_BAND_LABELS[matchEstimate.band]}
                    </strong>
                    {matchEstimate.lowConfidence ? (
                      <span className="match-estimate-hint-caveat">
                        当前候选人较少，仅供参考
                      </span>
                    ) : null}
                  </p>
                ) : null}
                <div className="school-exclusion-list">
                  {schoolOptions.map((school, i) => {
                    const activeGenders = activeExcludedGendersFor(
                      hardMatchForm,
                      school.id,
                    );
                    const isFullyExcluded =
                      activeGenders.length === HARD_MATCH_GENDERS.length;
                    const isPartiallyExcluded =
                      !isFullyExcluded && activeGenders.length > 0;
                    const rowClass = isFullyExcluded
                      ? "school-exclusion-row is-fully-excluded"
                      : isPartiallyExcluded
                        ? "school-exclusion-row is-partially-excluded"
                        : "school-exclusion-row";
                    return (
                      <section key={school.id} className={rowClass}>
                        <div className="school-exclusion-name">
                          <span
                            className="school-exclusion-name-text"
                            title={school.name}
                          >
                            {school.name}
                          </span>
                          {isFullyExcluded ? (
                            <span className="school-exclusion-status is-strong">
                              整校排除
                            </span>
                          ) : isPartiallyExcluded ? (
                            <span className="school-exclusion-status">
                              已排除：{activeGenders.join("、")}
                            </span>
                          ) : null}
                        </div>
                        <div
                          className="school-exclusion-genders"
                          role="group"
                          aria-label={`${school.name} 排除性别`}
                        >
                          {HARD_MATCH_GENDERS.map((gender, genderIndex) => {
                            const active = activeGenders.includes(gender);
                            return (
                              <label
                                key={gender}
                                className={
                                  active
                                    ? "school-exclusion-gender is-active"
                                    : "school-exclusion-gender"
                                }
                              >
                                <input
                                  checked={active}
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
          <div className="app-q-group">
            <div className="app-q-group-header">
              <span className="app-q-group-icon app-q-group-icon-values">
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
                const attentionItem = questionAttentionByKey.get(question.key);
                const showQuestionAttention =
                  attentionItem != null &&
                  (attentionItem.missingRequired ||
                    (attentionItem.updated && !attentionItem.acknowledged));
                const questionTitle = (
                  <div aria-hidden="true" className="question-block-title">
                    <span className="app-q-num">{questionIndex + 1}</span>
                    <span>{question.prompt}</span>
                  </div>
                );

                if (question.type === "MULTI_SELECT") {
                  const selected = Array.isArray(value) ? value : [];
                  const selectionLimit = question.selectionLimit ?? null;
                  const reachedSelectionLimit =
                    selectionLimit != null && selected.length >= selectionLimit;
                  return (
                    <fieldset
                      key={question.id}
                      ref={(node) =>
                        setAttentionBlockRef([question.key], node)
                      }
                      id={questionnaireQuestionElementId(question.key)}
                      className={attentionBlockClassName([question.key])}
                    >
                      <legend className="question-block-legend">
                        {question.prompt}
                      </legend>
                      {questionTitle}
                      {showQuestionAttention && attentionItem ? (
                        <p className="question-attention-note">
                          {questionnaireAttentionText(attentionItem)}
                        </p>
                      ) : null}
                      {selectionLimit != null ? (
                        <p className="app-muted">
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
                                disabled={!active && reachedSelectionLimit}
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
                  <fieldset
                    key={question.id}
                    ref={(node) => setAttentionBlockRef([question.key], node)}
                    id={questionnaireQuestionElementId(question.key)}
                    className={attentionBlockClassName([question.key])}
                  >
                    <legend className="question-block-legend">
                      {question.prompt}
                    </legend>
                    {questionTitle}
                    {showQuestionAttention && attentionItem ? (
                      <p className="question-attention-note">
                        {questionnaireAttentionText(attentionItem)}
                      </p>
                    ) : null}
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
    </div>
  );
}

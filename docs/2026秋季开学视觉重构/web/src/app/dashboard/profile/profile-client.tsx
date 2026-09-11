"use client";
import { BirthDatePicker } from "../_components/BirthDatePicker";

import { profileSavePresentation } from "./save-status";
import styles from "./profile-redesign.module.css";
import { ContactEditor, type ContactSaveStatus } from "./contact-editor";
import { dcx } from "../_lib/dashboard-class-names";
import {
  createAutosaveLifecycleGate,
  createAutosaveTimeoutController,
  takeNextAutosaveQueueItem,
  HARD_MATCH_WEIGHT_KEYS,
  type MatchEstimateBand,
} from "@lilink/shared";
import {
  Fragment,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  fetchApi,
  fetchMatchEstimate,
  isApiRequestError,
  type AuthMePayload,
  type MatchEstimate,
} from "../../../lib/api";
import {
  HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH,
  AGE_OPTIONS,
  BIRTH_YEAR_OPTIONS,
  HARD_MATCH_KEYS,
  HARD_MATCH_GENDERS,
  HARD_MATCH_LANGUAGES,
  HARD_MATCH_LOOKS,
  HARD_MATCH_NATIONALITIES,
  HEIGHT_OPTIONS,
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
  ContactPreferencesPayload,
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
  { id: "partner", label: "希望遇见谁" },
  { id: "values", label: "价值观" },
];

const HARD_MATCH_FIELD_KEY_GROUPS = {
  birthDate: [HARD_MATCH_KEYS.birthDate],
  gender: [HARD_MATCH_KEYS.gender],
  nationality: [HARD_MATCH_KEYS.nationality],
  languages: [HARD_MATCH_KEYS.languages],
  looks: [HARD_MATCH_KEYS.looks],
  heightCm: [HARD_MATCH_KEYS.heightCm],
  weightKg: [HARD_MATCH_KEYS.weightKg],
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
  if (item.updated && !item.acknowledged && item.missingRequired) {
    return "本题有更新，且当前答案待补完。";
  }

  if (item.updated && !item.acknowledged) {
    return "本题有更新。";
  }

  return "本题待补完。";
}

function renderQuestionBlockHeading(title: string) {
  return (
    <>
      <legend className={dcx("question-block-legend")}>{title}</legend>
      <div className={dcx("question-block-title")} aria-hidden="true">
        <span>{title}</span>
      </div>
    </>
  );
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
    case HARD_MATCH_KEYS.oneLinerIntro:
      return true;
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
    <div className={dcx("multi-choice-picker")}>
      <div className={dcx("multi-choice-summary")}>
        <div className={dcx("multi-choice-copy")}>
          <span className={dcx("multi-choice-count")}>
            {hasSelectedValues ? `已选 ${values.length} 项` : emptyLabel}
          </span>
          <div className={dcx("multi-choice-preview")}>
            {hasSelectedValues ? (
              <>
                {previewValues.map((value) => (
                  <span key={value} className={dcx("multi-choice-preview-chip")}>
                    {value}
                  </span>
                ))}
                {hiddenSelectedCount > 0 ? (
                  <span className={dcx("multi-choice-more")}>
                    +{hiddenSelectedCount}
                  </span>
                ) : null}
              </>
            ) : (
              <span className={dcx("multi-choice-empty")}>{emptyLabel}</span>
            )}
          </div>
        </div>
        <button
          type="button"
          className={dcx("multi-choice-trigger")}
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
        className={dcx("multi-choice-dialog")}
        aria-labelledby={`${id}-dialog-title`}
        onClose={() => setSearch("")}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeDialog();
          }
        }}
      >
        <div className={dcx("multi-choice-dialog-inner")}>
          <div className={dcx("multi-choice-dialog-head")}>
            <h4 id={`${id}-dialog-title`}>{title}</h4>
            <button
              type="button"
              className={dcx("multi-choice-dialog-close")}
              aria-label="关闭"
              onClick={closeDialog}
            >
              ×
            </button>
          </div>

          <input
            ref={searchInputRef}
            type="search"
            className={dcx("multi-choice-search")}
            value={search}
            placeholder={searchPlaceholder}
            onChange={(event) => setSearch(event.target.value)}
          />

          {allowEmpty ? (
            <button
              type="button"
              className={
                hasSelectedValues
                  ? dcx("multi-choice-clear")
                  : dcx("multi-choice-clear is-active")
              }
              onClick={clearSelection}
            >
              {emptyLabel}
            </button>
          ) : null}

          <div className={dcx("multi-choice-dialog-options")}>
            {filteredOptions.map((option, index) => {
              const active = values.includes(option);
              return (
                <label
                  key={option}
                  className={
                    active
                      ? dcx("multi-choice-dialog-option is-active")
                      : dcx("multi-choice-dialog-option")
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

          <div className={dcx("multi-choice-dialog-footer")}>
            <span>
              {hasSelectedValues ? `已选 ${values.length} 项` : emptyLabel}
            </span>
            <button
              type="button"
              className={dcx("multi-choice-done")}
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
  initialContactPreferences,
}: {
  initialContactPreferences: ContactPreferencesPayload;
  initialUser: AuthMePayload;
  initialDashboard: DashboardPayload;
  initialQuestions: Question[];
  initialSchools: HardMatchSchoolOption[];
  initialSavedQuestionnaire: SavedQuestionnairePayload;
}) {
  useDashboardSessionSeed(initialUser);
  const router = useRouter();

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
  const [displayName, setDisplayName] = useState(initialDraft?.displayName ?? initialUser.displayName ?? "");
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
  const [acknowledgedHardMatchKeys, setAcknowledgedHardMatchKeys] = useState<
    string[]
  >([]);
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
    const acknowledgedHardMatchKeySet = new Set(acknowledgedHardMatchKeys);
    const hardMatchKeySet = new Set<string>(
      hardMatchAttentionFields().map((field) => field.key),
    );
    const attentionByKey = new Map<string, QuestionnaireAttentionItem>();

    for (const item of questionnaireAttention?.items ?? []) {
      attentionByKey.set(item.key, {
        ...item,
        // Hard-match acknowledgement is decided by the backend signature; only
        // soft questions fall back to the version-scoped acknowledgedKeys.
        acknowledged: hardMatchKeySet.has(item.key)
          ? item.acknowledged || acknowledgedHardMatchKeySet.has(item.key)
          : !item.updated || acknowledgedKeys.has(item.key),
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
          // Preserve the backend signature-based acknowledgement set above.
          acknowledged: current.acknowledged,
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
            ? current.acknowledged || acknowledgedHardMatchKeySet.has(field.key)
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
    acknowledgedHardMatchKeys,
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

  // Weight nudges clear only on an explicit save, never by passively scrolling
  // the field into view, so the auto-acknowledge observer skips weight keys.
  const autoAcknowledgeKeys = useMemo(
    () =>
      pendingUpdatedAttentionKeys.filter(
        (key) => !HARD_MATCH_WEIGHT_KEYS.includes(key),
      ),
    [pendingUpdatedAttentionKeys],
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
    return dcx(
      attentionItemForKeys(keys)
        ? "question-block question-block-attention"
        : "question-block",
    );
  }

  function renderAttentionNote(keys: readonly string[]) {
    const item = attentionItemForKeys(keys);
    return item ? (
      <p className={dcx("question-attention-note")}>
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
          const hardMatchKeySet = new Set<string>(
            hardMatchAttentionFields().map((field) => field.key),
          );
          const hardMatchKeys = keys.filter((key) => hardMatchKeySet.has(key));
          if (hardMatchKeys.length > 0) {
            setAcknowledgedHardMatchKeys((current) => [
              ...new Set([...current, ...hardMatchKeys]),
            ]);
          }
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

    const targetTab = key === HARD_MATCH_KEYS.oneLinerIntro ? "self" : profileAttentionTabForKey(key, questions);
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
        document.getElementById(profileAttentionElementId(key));
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
  }, [activeTab, questions, router]);

  useEffect(() => {
    if (
      !questionnaireAttention ||
      autoAcknowledgeKeys.length === 0 ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const timers = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const keys = autoAcknowledgeKeys.filter(
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
    for (const key of autoAcknowledgeKeys) {
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
  }, [activeTab, autoAcknowledgeKeys, questionnaireAttention]);

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
          setAcknowledgedHardMatchKeys(
            hardMatchAttentionFields().map((field) => field.key),
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

  const [contactSaveStatus, setContactSaveStatus] = useState<ContactSaveStatus>("saved");
  const hasSavedQuestionnaire = Boolean(dashboard?.questionnaireSubmittedAt);
  const questionnairePresentation = profileSavePresentation(
    questionnaireSaveError ? "error" : questionnaireSaveState,
    hasSavedQuestionnaire,
    hasQuestionnaireDraft || Boolean(questionnaireIncompleteMessage),
    questionnaireSnapshot !== lastSavedQuestionnaireSnapshotRef.current,
  );
  const savePresentation = contactSaveStatus === "saved" ? questionnairePresentation : {
    label: contactSaveStatus === "error" ? "联系方式保存失败" : contactSaveStatus === "invalid" ? "联系方式待补全" : "联系方式正在自动保存",
    detail: contactSaveStatus === "invalid" ? "请在关于你中填写选中的联系方式。" : contactSaveStatus === "error" ? "请在联系方式处重试保存。" : "请等待联系方式保存完成。",
    tone: contactSaveStatus === "error" ? "error" : "pending",
  };
  const incompleteTargets: { key: string; tab: ProfileTab }[] = [];
  if (displayName.trim().length < 2) incompleteTargets.push({ key: "nickname", tab: "self" });
  if (!hardMatchForm.oneLinerIntro.trim()) incompleteTargets.push({ key: HARD_MATCH_KEYS.oneLinerIntro, tab: "self" });
  const incompleteGroups = new Set<string>();
  for (const field of hardMatchAttentionFields()) {
    if (!field.required || hardMatchFieldIsComplete(field.key, hardMatchForm)) continue;
    const group = Object.entries(HARD_MATCH_FIELD_KEY_GROUPS).find(([, keys]) => (keys as readonly string[]).includes(field.key))?.[0] ?? field.key;
    if (incompleteGroups.has(group)) continue;
    incompleteGroups.add(group);
    incompleteTargets.push({ key: field.key, tab: field.tab });
  }
  for (const question of questions) {
    if (!softQuestionAnswerIsComplete(question, answers[question.key])) incompleteTargets.push({ key: question.key, tab: "values" });
  }
  const [pendingIncompleteKey, setPendingIncompleteKey] = useState<{ key: string } | null>(null);
  function locateIncomplete() {
    const target = incompleteTargets[0];
    if (!target) return;
    setActiveTab(target.tab);
    setPendingIncompleteKey({ key: target.key });
  }
  useEffect(() => {
    if (!pendingIncompleteKey) return;
    const target = questionBlockRefs.current.get(pendingIncompleteKey.key) ?? document.getElementById(profileAttentionElementId(pendingIncompleteKey.key));
    if (target) {
      target.scrollIntoView({ block: "center", behavior: "instant" });
      target.classList.add(styles.incompleteFocus);
      target.querySelector<HTMLElement>("input, textarea, select, button")?.focus({ preventScroll: true });
    }
    const timer = window.setTimeout(() => target?.classList.remove(styles.incompleteFocus), 2500);
    return () => { window.clearTimeout(timer); target?.classList.remove(styles.incompleteFocus); };
  }, [pendingIncompleteKey, activeTab]);
  const [completedSnapshot, setCompletedSnapshot] = useState<string | null>(null);
  const activeModuleIndex = PROFILE_TABS.findIndex((tab) => tab.id === activeTab);
  const nextModule = PROFILE_TABS[activeModuleIndex + 1];
  const previousModule = PROFILE_TABS[activeModuleIndex - 1];
  const moduleNavRef = useRef<HTMLElement>(null);
  const focusModuleAfterChange = useRef(false);
  function changeModule(id: ProfileTab) {
    focusModuleAfterChange.current = true;
    setActiveTab(id);
  }
  useEffect(() => {
    if (!focusModuleAfterChange.current) return;
    moduleNavRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({ preventScroll: true });
    moduleNavRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
    focusModuleAfterChange.current = false;
  }, [activeTab]);

  return (
    <div className={`${dcx("app-page-shell v2-page-shell")} ${styles.page}`}>
      <header className={dcx("v2-greeting")}><div className={dcx("v2-greeting-main")}>
        <h1 className={dcx("v2-match-page-title")}>我的资料</h1>
        <p className={dcx("v2-greeting-sub v2-match-page-subtitle")}>你的基本信息、匹配偏好与价值观，是算法为你寻找合适对象的依据。</p>
        <p className={dcx("v2-greeting-sub v2-match-page-subtitle")}>填写和选择后自动保存，无需手动提交。</p>
      </div></header>
      <aside className={styles.saveNotice} data-tone={savePresentation.tone} aria-label="问卷保存状态" role="status" aria-live="polite" aria-atomic="true">
        <strong>{savePresentation.label}</strong>
        <span>{savePresentation.detail}</span>
        {questionnaireSaveError ? <button type="button" onClick={() => setQuestionnaireManualRetryTick((tick) => tick + 1)}>重试保存</button> : null}
      </aside>
      <section className={dcx("ui-card ui-card--padded")}>
        <div className={dcx("app-q-toolbar")}>
          {questionnaireSaveError ? (
            <button
              className={dcx("ui-button ui-button--secondary")}
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
          <p className={dcx("ui-form-message ui-form-message--error")} role="alert">
            {questionnaireIncompleteMessage}
          </p>
        ) : null}

        <nav ref={moduleNavRef} aria-label="问卷分组" className={dcx("app-section-tabs")}>
          {PROFILE_TABS.map((tab, index) => (
            <Fragment key={tab.id}>
            <button
              type="button"
              className={
                tab.id === activeTab
                  ? dcx("app-section-tab is-active")
                  : dcx("app-section-tab")
              }
              aria-pressed={tab.id === activeTab}
              onClick={() => changeModule(tab.id)}
            >
              {tab.label}
            </button>
            {index < PROFILE_TABS.length - 1 ? <span className={styles.moduleArrow} aria-hidden="true">→</span> : null}
            </Fragment>
          ))}
        </nav>


        {/* ── 关于你 ── */}
        {(
          <div hidden={activeTab !== "self"} className={`${dcx("app-q-group")} ${styles.selfFlat}`}>
            <section className={styles.identity} aria-label="自我介绍">
              <div className={styles.sectionHeading}><h2>自我介绍</h2><p>对匹配对象展示</p></div>
              <div className={styles.introductionCard}>
              <label id={profileAttentionElementId("nickname")}>昵称<span className={styles.nameInput}><input value={displayName} maxLength={30} onChange={(event) => setDisplayName(event.target.value)} placeholder="希望 TA 怎样称呼你" /></span></label>
              <label id={profileAttentionElementId(HARD_MATCH_KEYS.oneLinerIntro)}>一句话介绍<textarea rows={3} maxLength={HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH} value={hardMatchForm.oneLinerIntro} onChange={(event) => setHardMatchForm((form) => ({ ...form, oneLinerIntro: event.target.value }))} placeholder="聊聊你的兴趣，以及期待怎样的相遇" /><span className={styles.charCount}>{hardMatchForm.oneLinerIntro.length}/{HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH}</span></label>
              </div>
            </section>
            <ContactEditor onStatus={setContactSaveStatus} initial={initialContactPreferences} email={initialUser.email} />
            <section className={styles.basicSection} aria-label="基本信息">
            <div className={styles.sectionHeading}><h2>基本信息</h2></div>
            <div className={dcx("question-list")}>
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
                {renderQuestionBlockHeading("出生日期")}
                {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.birthDate)}
                <BirthDatePicker
                  minYear={Math.min(...BIRTH_YEAR_OPTIONS)} maxYear={Math.max(...BIRTH_YEAR_OPTIONS)}
                  value={hardMatchForm.birthYear && hardMatchForm.birthMonth && hardMatchForm.birthDay ? `${hardMatchForm.birthYear}-${hardMatchForm.birthMonth.padStart(2, "0")}-${hardMatchForm.birthDay.padStart(2, "0")}` : ""}
                  onChange={value => {
                    const [birthYear, birthMonth, birthDay] = value.split("-");
                    setHardMatchForm(form => ({ ...form, birthYear, birthMonth: String(Number(birthMonth)), birthDay: String(Number(birthDay)) }));
                  }}
                />
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
                {renderQuestionBlockHeading("性别")}
                {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.gender)}
                <div className={dcx("option-list")}>
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
                {renderQuestionBlockHeading("国籍")}
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
                <legend className={dcx("question-block-legend")}>语言（可多选）</legend>
                <div className={styles.languageLabel} aria-hidden="true"><span>语言</span><small>（多选）</small></div>
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
                {renderQuestionBlockHeading("颜值自评")}
                {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.looks)}
                <div className={dcx("option-list")}>
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
                {renderQuestionBlockHeading("身高")}
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
                {renderQuestionBlockHeading("体重")}
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

            </div>
            </section>
          </div>
        )}

        {/* ── 对方条件 ── */}
        {activeTab === "partner" && (
          <div className={dcx("app-q-group")}>
            <div className={dcx("question-list")}>
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
                {renderQuestionBlockHeading("对方年龄理想区间")}
                {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.partnerAge)}
                <p className={dcx("app-muted")}>
                  填对方的<strong>实际年龄</strong>数字（例如 18 到 25），
                  不是与你的年龄差。
                </p>
                <div className={dcx("form-grid")}>
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
                {renderQuestionBlockHeading("希望对方的性别（可多选）")}
                {renderAttentionNote(
                  HARD_MATCH_FIELD_KEY_GROUPS.partnerGenders,
                )}
                <div className={dcx("chip-grid")}>
                  {HARD_MATCH_GENDERS.map((g, i) => {
                    const active = hardMatchForm.partnerGenders.includes(g);
                    return (
                      <label
                        key={g}
                        className={dcx(active ? "chip active" : "chip")}
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
                {renderQuestionBlockHeading("希望对方的国籍")}
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
                {renderQuestionBlockHeading("希望对方的语言")}
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
                {renderQuestionBlockHeading("希望对方的颜值（可多选）")}
                {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.partnerLooks)}
                <div className={dcx("chip-grid")}>
                  {HARD_MATCH_LOOKS.map((l, i) => {
                    const active = hardMatchForm.partnerLooks.includes(l);
                    return (
                      <label
                        key={l}
                        className={dcx(active ? "chip active" : "chip")}
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
                {renderQuestionBlockHeading("希望对方的身高范围（厘米）")}
                {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.partnerHeight)}
                <div className={dcx("form-grid")}>
                  <label>
                    <span>最低</span>
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
                    <span>最高</span>
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
                {renderQuestionBlockHeading("希望对方的体重范围（公斤）")}
                {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.partnerWeight)}
                <div className={dcx("form-grid")}>
                  <label>
                    <span>最低</span>
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
                    <span>最高</span>
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
                {renderQuestionBlockHeading("按学校排除（可选）")}
                {renderAttentionNote(
                  HARD_MATCH_FIELD_KEY_GROUPS.excludedPartnerSchools,
                )}
                <p className={dcx("app-muted")}>
                  在每所学校上，勾选你不希望匹配的性别。三项全选即整校排除。
                </p>
                {matchEstimate ? (
                  <p
                    className={dcx(`match-estimate-hint ${MATCH_ESTIMATE_BAND_MODIFIERS[matchEstimate.band]}${matchEstimatePending ? " is-pending" : ""}`)}
                    role="status"
                    aria-live="polite"
                  >
                    <span className={dcx("match-estimate-hint-label")}>
                      排除后匹配到的概率：
                    </span>
                    <strong className={dcx("match-estimate-hint-band")}>
                      {MATCH_ESTIMATE_BAND_LABELS[matchEstimate.band]}
                    </strong>
                    {matchEstimate.lowConfidence ? (
                      <span className={dcx("match-estimate-hint-caveat")}>
                        当前候选人较少，仅供参考
                      </span>
                    ) : null}
                  </p>
                ) : null}
                <div className={dcx("school-exclusion-list")}>
                  {schoolOptions.map((school, i) => {
                    const activeGenders = activeExcludedGendersFor(
                      hardMatchForm,
                      school.id,
                    );
                    const isFullyExcluded =
                      activeGenders.length === HARD_MATCH_GENDERS.length;
                    const isPartiallyExcluded =
                      !isFullyExcluded && activeGenders.length > 0;
                    const rowClass = dcx(
                      isFullyExcluded
                        ? "school-exclusion-row is-fully-excluded"
                        : isPartiallyExcluded
                          ? "school-exclusion-row is-partially-excluded"
                          : "school-exclusion-row",
                    );
                    return (
                      <section key={school.id} className={rowClass}>
                        <div className={dcx("school-exclusion-name")}>
                          <span
                            className={dcx("school-exclusion-name-text")}
                            title={school.name}
                          >
                            {school.name}
                          </span>
                          {isFullyExcluded ? (
                            <span className={dcx("school-exclusion-status is-strong")}>
                              整校排除
                            </span>
                          ) : isPartiallyExcluded ? (
                            <span className={dcx("school-exclusion-status")}>
                              已排除：{activeGenders.join("、")}
                            </span>
                          ) : null}
                        </div>
                        <div
                          className={dcx("school-exclusion-genders")}
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
                                    ? dcx("school-exclusion-gender is-active")
                                    : dcx("school-exclusion-gender")
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
          <div className={dcx("app-q-group")}>
            <p className={styles.moduleDescription}>共 {questions.length} 题，帮助算法了解你的价值观与相处偏好。</p>
            <div className={dcx("question-list")}>
              {questions.map((question, questionIndex) => {
                const value = answers[question.key];
                const attentionItem = questionAttentionByKey.get(question.key);
                const showQuestionAttention =
                  attentionItem != null &&
                  (attentionItem.missingRequired ||
                    (attentionItem.updated && !attentionItem.acknowledged));
                const questionTitle = (
                  <div aria-hidden="true" className={dcx("question-block-title")}>
                    <span className={dcx("app-q-num")}>{questionIndex + 1}</span>
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
                      id={profileAttentionElementId(question.key)}
                      className={attentionBlockClassName([question.key])}
                    >
                      <legend className={dcx("question-block-legend")}>
                        {question.prompt}
                      </legend>
                      {questionTitle}
                      {showQuestionAttention && attentionItem ? (
                        <p className={dcx("question-attention-note")}>
                          {questionnaireAttentionText(attentionItem)}
                        </p>
                      ) : null}
                      {selectionLimit != null ? (
                        <p className={dcx("app-muted")}>
                          本题最多选择 {selectionLimit} 项。
                        </p>
                      ) : null}
                      <div className={dcx("chip-grid")}>
                        {question.options?.map((option, optionIndex) => {
                          const active = selected.includes(option.value);
                          return (
                            <label
                              key={option.value}
                              className={dcx(active ? "chip active" : "chip")}
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
                    id={profileAttentionElementId(question.key)}
                    className={attentionBlockClassName([question.key])}
                  >
                    <legend className={dcx("question-block-legend")}>
                      {question.prompt}
                    </legend>
                    {questionTitle}
                    {showQuestionAttention && attentionItem ? (
                      <p className={dcx("question-attention-note")}>
                        {questionnaireAttentionText(attentionItem)}
                      </p>
                    ) : null}
                    <div className={dcx("option-list")}>
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
        <footer className={styles.moduleFooter}>
          <div className={styles.moduleActions}>
            <button className={styles.previousModule} type="button" disabled={!previousModule} onClick={() => previousModule && changeModule(previousModule.id)}>← 上一模块</button>
            <span className={styles.modulePage} aria-label={`第 ${activeModuleIndex + 1} 部分，共 ${PROFILE_TABS.length} 部分`}>{activeModuleIndex + 1} / {PROFILE_TABS.length}</span>
            {nextModule ? <button className={styles.nextModule} type="button" onClick={() => changeModule(nextModule.id)}>下一模块 →</button> : <button className={`${styles.nextModule} ${incompleteTargets.length ? styles.locateIncomplete : ""}`} type="button" disabled={!incompleteTargets.length && savePresentation.tone !== "saved"} onClick={() => incompleteTargets.length ? locateIncomplete() : setCompletedSnapshot(questionnaireSnapshot)}>{incompleteTargets.length ? `还有 ${incompleteTargets.length} 题未完成，点击定位` : "完成问卷"}</button>}
          </div>
          {completedSnapshot === questionnaireSnapshot && savePresentation.tone === "saved" ? <p className={styles.completionSuccess} role="status">保存成功，问卷已填写完成。</p> : null}
        </footer>
      </section>
    </div>
  );
}

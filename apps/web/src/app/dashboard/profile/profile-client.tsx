"use client";
import Link from "next/link";
import { QuestionField, QuestionHeading, ScaleChoice, ChoiceOption, QuestionChoices } from "./question-components";
import type { VipStatus } from "../vip/vip-client";
import { LIFESTYLE_QUESTIONS, calculateAgeOnDate, isLifestyleQuestion, VIP_FILTER_KEYS } from "@lilink/shared";
import { BirthDatePicker } from "../_components/BirthDatePicker";

import { profileSavePresentation } from "./save-status";
import styles from "./profile-redesign.module.css";
import { ContactEditor, type ContactSaveStatus } from "./contact-editor";
import { ReaderScrollHint } from "./reader-scroll-hint";
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
  useCallback,
  useEffect,
  useLayoutEffect,
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
  HARD_MATCH_LOOKS,
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
  ...numericOptions(WEIGHT_OPTIONS, (weight) => `${weight} kg`),
];
const PARTNER_WEIGHT_VALUE_OPTIONS = [
  { value: "", label: "不限" },
  ...numericOptions(WEIGHT_OPTIONS, (weight) => `${weight} kg`),
];

const LOOKS_DESCRIPTIONS: Record<number, string> = {
  1: "1–3分：五官存在明显硬伤，如面部不流畅、不对称等。这个分数段更多被认为是对自己不够上心，不注重打扮。",
  2: "1–3分：五官存在明显硬伤，如面部不流畅、不对称等。这个分数段更多被认为是对自己不够上心，不注重打扮。",
  3: "1–3分：五官存在明显硬伤，如面部不流畅、不对称等。这个分数段更多被认为是对自己不够上心，不注重打扮。",
  4: "4分：普通路人水平，五官没有明显缺陷，但缺乏亮点，容易给人‘好人卡’的感觉。",
  5: "5分：路人缘不错的类型，第一眼看上去很舒服，说不上惊艳，但绝对不讨厌。",
  6: "6分：班花级别，身高、五官或身材中至少有一项比较突出，在校园中不缺男生表白。",
  7: "7分：校花或校园女神级别，在普通人中非常亮眼，风格、审美和穿搭基本没有毛病。",
  8: "8分：模特水准，辨识度很高，能够通过颜值变现，在社交媒体上拥有较高人气。",
  9: "9分：颜值天花板，通常是娱乐圈或时尚圈的明星，如杨幂、迪丽热巴等，其精致度和氛围感是普通人无法企及的。",
  10: "10分：无人可及",
};

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
  | "retrying"
  | "draft-saved"
  | "submitted"
  | "error";

const QUESTIONNAIRE_AUTOSAVE_RETRY_DELAYS_MS = [1500, 3000, 5000, 10000];
const QUESTIONNAIRE_AUTOSAVE_MAX_RETRY_ATTEMPTS =
  QUESTIONNAIRE_AUTOSAVE_RETRY_DELAYS_MS.length;
const QUESTIONNAIRE_AUTOSAVE_TIMEOUT_MS = 15000;
const QUESTIONNAIRE_ATTENTION_VIEW_MS = 200;

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
  return <QuestionHeading>{title}</QuestionHeading>;
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
      return numericFormValueIsComplete(hardMatchForm.weightKg);
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

export function ProfileClient({
  initialUser,
  initialDashboard,
  initialQuestions,
  initialSchools,
  initialSavedQuestionnaire,
  initialContactPreferences,
  initialVip = null,
  initialQuestionnaireVersionId,
}: {
  initialQuestionnaireVersionId?: string;
  initialVip?: VipStatus | null;
  initialContactPreferences: ContactPreferencesPayload;
  initialUser: AuthMePayload;
  initialDashboard: Pick<DashboardPayload, "questionnaireSubmittedAt">;
  initialQuestions: Question[];
  initialSchools: HardMatchSchoolOption[];
  initialSavedQuestionnaire: SavedQuestionnairePayload;
}) {
  useDashboardSessionSeed(initialUser);
  const router = useRouter();
  const [vip, setVip] = useState(initialVip);
  const vipActive = Boolean(vip?.active);
  const vipDialogRef = useRef<HTMLDialogElement>(null);
  function updatePremiumForm(update: Parameters<typeof setHardMatchForm>[0]) {
    if (!vipActive) { vipDialogRef.current?.showModal(); return; }
    setHardMatchForm(update);
  }
  useEffect(() => {
    let disposed = false;
    const refresh = () => { void fetchApi<VipStatus>("/me/vip").then(next => {
      if (!disposed) setVip(next);
    }).catch(() => { if (!disposed) setVip(null); }); };
    const expire = vip?.expiresAt ? window.setTimeout(() => {
      if (Date.parse(vip.expiresAt!) <= Date.now()) setVip(current => current ? { ...current, active: false } : null);
      refresh();
    }, Math.min(2_147_483_647, Math.max(0, Date.parse(vip.expiresAt) - Date.now()))) : undefined;
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(refresh, 30_000);
    return () => { disposed = true; window.removeEventListener("focus", refresh); window.clearInterval(interval); window.clearTimeout(expire); };
  }, [vip?.expiresAt]);

  const initialDraft = initialSavedQuestionnaire?.draft ?? null;
  const initialSubmittedAnswers = initialSavedQuestionnaire?.answers;
  const loadedHardMatchForm =
    initialDraft?.hardMatchForm ??
    hardMatchFormFromAnswers(initialSubmittedAnswers, initialSchools);
  const initialHardMatchForm = { ...loadedHardMatchForm, partnerLooks: loadedHardMatchForm.partnerLooks.length ? loadedHardMatchForm.partnerLooks : [...HARD_MATCH_LOOKS] };
  const [dashboard, setDashboard] = useState<Pick<DashboardPayload, "questionnaireSubmittedAt"> | null>(
    initialDashboard,
  );
  const [questions] = useState<Question[]>(initialQuestions);
  const lifestyleQuestions = useMemo(() => questions.filter(question => isLifestyleQuestion(question.key)), [questions]);
  const valuesQuestions = useMemo(() => questions.filter(question => !isLifestyleQuestion(question.key)), [questions]);
  const [schoolSearch, setSchoolSearch] = useState("");
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
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const questionAnimations = useRef<Animation[]>([]);
  const cancelQuestionTransition = useCallback(() => {
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    autoAdvanceTimer.current = null;
    questionAnimations.current.forEach(animation => animation.cancel());
    questionAnimations.current = [];
  }, []);
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
    if (!vipActive) { setMatchEstimate(null); setMatchEstimatePending(false); return; }
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
    vipActive,
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
      if (!vipActive && VIP_FILTER_KEYS.includes(item.key)) continue;
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
      if (!vipActive && VIP_FILTER_KEYS.includes(field.key)) continue;
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
        !softQuestionAnswerIsComplete(question, answers[question.key]);

      const current = attentionByKey.get(question.key);
      if (!missingRequired) {
        if (current?.updated) attentionByKey.set(question.key, { ...current, missingRequired: false });
        else attentionByKey.delete(question.key);
        continue;
      }

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
    vipActive,
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
    let timeoutId: number | undefined;
    function locateAttentionHash() {
      window.clearTimeout(timeoutId);
      const attentionHash = window.location.hash;
      const key = profileAttentionKeyFromHash(attentionHash);
      if (!key) {
        return;
      }

      const targetTab = key === HARD_MATCH_KEYS.oneLinerIntro ? "self" : profileAttentionTabForKey(key, questions);
      if (!targetTab) {
        return;
      }

      cancelQuestionTransition();
      if (activeTab !== targetTab) {
        setActiveTab(targetTab);
        return;
      }

      timeoutId = window.setTimeout(() => {
        const target =
          questionBlockRefs.current.get(key) ??
          document.getElementById(profileAttentionElementId(key));
        const item = target?.closest<HTMLElement>('[data-reader-item]');
        const readerModule = item?.closest('[data-reader-module]');
        if (item && readerModule) {
          cancelQuestionTransition();
          setQuestionIndex(Array.from(readerModule.querySelectorAll('[data-reader-item]')).indexOf(item));
        }
        target?.scrollIntoView({ block: "center" });

        if (target && window.location.hash === attentionHash) {
          window.history.replaceState(
            window.history.state,
            "",
            `${window.location.pathname}${window.location.search}`,
          );
        }
      }, 0);
    }

    locateAttentionHash();
    window.addEventListener("hashchange", locateAttentionHash);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("hashchange", locateAttentionHash);
    };
  }, [activeTab, questions, router, cancelQuestionTransition]);

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
      setQuestionnaireSaveState(questionnaireRetryAttemptRef.current > 0 ? "retrying" : "saving");
      setQuestionnaireSaveError(null);

      try {
        const result = await fetchApi<QuestionnaireSaveResponse>(
          "/me/questionnaire",
          {
            method: "PUT",
            body: JSON.stringify({ ...payload, versionId: initialQuestionnaireVersionId ?? initialSavedQuestionnaire?.currentVersionId }),
            signal: autosaveTimeout.signal,
          },
          questionnaireRetryAttemptRef.current > 0 ? "/api/questionnaire" : undefined,
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
        const savedWeightKeys = HARD_MATCH_WEIGHT_KEYS.filter(key =>
          hardMatchFieldIsComplete(key, payload.hardMatchForm),
        );
        if (savedWeightKeys.length) void acknowledgeQuestionnaireKeys(savedWeightKeys);
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

        setQuestionnaireSaveState(shouldScheduleRetry ? "retrying" : "error");
        setQuestionnaireSaveError(shouldScheduleRetry ? null :
          questionnaireAutosaveFailureMessage(caughtError, retryDelayMs));
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
          current === "pending" || current === "retrying" || current === "error" ? "idle" : current,
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
        current === "pending" || current === "retrying" || current === "error" ? "idle" : current,
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

  const [contactSaveStatus, setContactSaveStatus] = useState<ContactSaveStatus>("saved");
  const hasSavedQuestionnaire = Boolean(dashboard?.questionnaireSubmittedAt);
  const incompleteTargets: { key: string; tab: ProfileTab }[] = [];
  if (displayName.trim().length < 2) incompleteTargets.push({ key: "nickname", tab: "self" });
  if (!hardMatchForm.oneLinerIntro.trim()) incompleteTargets.push({ key: HARD_MATCH_KEYS.oneLinerIntro, tab: "self" });
  const incompleteGroups = new Set<string>();
  for (const field of hardMatchAttentionFields()) {
    if (!vipActive && VIP_FILTER_KEYS.includes(field.key)) continue;
    if (!field.required || hardMatchFieldIsComplete(field.key, hardMatchForm)) continue;
    const group = Object.entries(HARD_MATCH_FIELD_KEY_GROUPS).find(([, keys]) => (keys as readonly string[]).includes(field.key))?.[0] ?? field.key;
    if (incompleteGroups.has(group)) continue;
    incompleteGroups.add(group);
    incompleteTargets.push({ key: field.key, tab: field.tab });
  }
  for (const question of questions) {
    if (!softQuestionAnswerIsComplete(question, answers[question.key])) incompleteTargets.push({ key: question.key, tab: isLifestyleQuestion(question.key) ? "self" : "values" });
  }
  const questionnairePresentation = profileSavePresentation(
    questionnaireSaveError ? "error" : questionnaireSaveState,
    hasSavedQuestionnaire,
    hasQuestionnaireDraft,
    questionnaireSnapshot !== lastSavedQuestionnaireSnapshotRef.current,
    incompleteTargets.length > 0,
  );
  const savePresentation = contactSaveStatus === "saved" ? questionnairePresentation : {
    label: contactSaveStatus === "error" ? "联系方式保存失败" : contactSaveStatus === "invalid" ? "联系方式待补全" : "联系方式正在自动保存",
    detail: contactSaveStatus === "invalid" ? "请在关于你中填写选中的联系方式。" : contactSaveStatus === "error" ? "请在联系方式处重试保存。" : "请等待联系方式保存完成。",
    tone: contactSaveStatus === "error" ? "error" : "pending",
  };
  const [pendingIncompleteKey, setPendingIncompleteKey] = useState<{ key: string } | null>(null);
  function locateIncomplete() {
    const target = incompleteTargets[0];
    if (!target) return;
    const index = readerItems.filter(item => item.tab === target.tab).findIndex(item => item.elementIds.has(profileAttentionElementId(target.key)));
    openQuestion(target.tab, Math.max(0, index));
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
  const readerRef = useRef<HTMLDivElement>(null);
  const directoryRef = useRef<HTMLDialogElement>(null);
  const [readerItems, setReaderItems] = useState<{ node: HTMLElement; tab: ProfileTab; title: string; elementIds: Set<string> }[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const previousReaderSelection = useRef<string | null>(null);
  const moduleItems = useMemo(() => readerItems.filter(item => item.tab === activeTab), [readerItems, activeTab]);
  const currentIndex = Math.min(questionIndex, Math.max(0, moduleItems.length - 1));
  const previousReaderModule = PROFILE_TABS[PROFILE_TABS.findIndex(tab => tab.id === activeTab) - 1];
  const nextReaderModule = PROFILE_TABS[PROFILE_TABS.findIndex(tab => tab.id === activeTab) + 1];
  const lastReaderQuestion = currentIndex >= moduleItems.length - 1;
  function finishReader() {
    if (incompleteTargets.length) locateIncomplete();
    else setCompletedSnapshot(questionnaireSnapshot);
  }
  function changeModule(id: ProfileTab) {
    cancelQuestionTransition();
    setQuestionIndex(0);
    setActiveTab(id);
  }
  useLayoutEffect(() => {
    cancelQuestionTransition();
    const root = readerRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-reader-item]')).map(node => ({
      node,
      elementIds: new Set([node.id, ...Array.from(node.querySelectorAll('[id]'), element => element.id)]),
      tab: node.closest<HTMLElement>('[data-reader-module]')!.dataset.readerModule as ProfileTab,
      title: node.getAttribute('data-reader-title') || node.getAttribute('aria-label') || node.querySelector('legend, h2')?.textContent?.trim() || '资料',
    }));
    setReaderItems(items);
  }, [vipActive, questions, cancelQuestionTransition]);
  useLayoutEffect(() => {
    for (const item of readerItems) item.node.dataset.readerHidden = String(item !== moduleItems[currentIndex]);
    if (!moduleItems[currentIndex]) return;
    const selection = `${activeTab}:${currentIndex}`;
    if (previousReaderSelection.current !== selection && readerRef.current) {
      readerRef.current.scrollTop = 0;
    }
    previousReaderSelection.current = selection;
  }, [readerItems, moduleItems, currentIndex, activeTab]);
  useEffect(() => cancelQuestionTransition, [cancelQuestionTransition]);
  function openQuestion(tab: ProfileTab, index: number, animate = false) {
    cancelQuestionTransition();
    const leaving = moduleItems[currentIndex]?.node;
    const arriving = readerItems.filter(item => item.tab === tab)[index]?.node;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (leaving && arriving && leaving !== arriving && animate && !reduced) {
      const departure = leaving.animate([{ transform: "translateX(0)", opacity: 1 }, { transform: "translateX(-40px)", opacity: 0 }], { duration: 160, easing: "ease-in", fill: "forwards" });
      questionAnimations.current = [departure];
      autoAdvanceTimer.current = setTimeout(() => {
        autoAdvanceTimer.current = null;
        departure.cancel();
        setActiveTab(tab);
        setQuestionIndex(index);
        questionAnimations.current = [arriving.animate([{ transform: "translateX(48px)", opacity: 0 }, { transform: "translateX(0)", opacity: 1 }], { duration: 280, easing: "cubic-bezier(.22,1,.36,1)" })];
        if (readerRef.current) readerRef.current.scrollTop = 0;
      }, 160);
    } else {
      setActiveTab(tab);
      setQuestionIndex(index);
    }
    directoryRef.current?.close();
    if (!animate && readerRef.current) readerRef.current.scrollTop = 0;
  }
  function questionOptions(fieldId: string, options: ValuePickerOption[], value: string) {
    if (moduleItems[currentIndex]?.elementIds.has(fieldId)) return options;
    return options.filter(option => option.value === value);
  }
  function itemIncomplete(item: (typeof readerItems)[number]) {
    return incompleteTargets.some(target => item.elementIds.has(profileAttentionElementId(target.key)));
  }


  return (
    <div data-desktop-viewport className={`${dcx("app-page-shell v2-page-shell")} ${styles.page}`}>
      <header className={styles.pageHeading}>
        <span className={styles.eyebrow}>让我们更了解你</span>
        <h1>我的资料</h1>
        <p>从日常习惯到心动偏好，慢慢写下真实的你。</p>
      </header>
      <aside className={styles.saveNotice} data-tone={savePresentation.tone} aria-label="问卷保存状态" role="status" aria-live="polite" aria-atomic="true">
        <strong>{savePresentation.label}</strong>
        <span>{savePresentation.detail}</span>
        {questionnaireSaveError ? <button type="button" onClick={() => setQuestionnaireManualRetryTick((tick) => tick + 1)}>重试保存</button> : null}
      </aside>
      <section className={`${dcx("ui-card ui-card--padded")} ${styles.workspace}`}>
        <aside className={styles.desktopDirectory} aria-label="桌面题目目录">
          <h2>题目目录</h2>
          <p>按模块查看，点击题号跳转</p>
          <div className={styles.directoryLegend}><span>● 已答</span><span>○ 未答</span><span>◎ 当前</span></div>
          {PROFILE_TABS.map(tab => {
            const items = readerItems.filter(item => item.tab === tab.id);
            return <section key={tab.id}>
              <h3>{tab.label}<small>{items.filter(item => !itemIncomplete(item)).length} / {items.length}</small></h3>
              <div className={styles.numberGrid}>{items.map((item, index) => <button type="button" key={index} aria-label={`${tab.label}第 ${index + 1} 题：${item.title}`} aria-current={activeTab === tab.id && currentIndex === index ? "step" : undefined} data-complete={!itemIncomplete(item)} onClick={() => openQuestion(tab.id, index)}>{String(index + 1).padStart(2, "0")}</button>)}</div>
            </section>;
          })}
        </aside>
        <nav aria-label="问卷分组" className={dcx("app-section-tabs")}>
          {PROFILE_TABS.map((tab) => (
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

            </Fragment>
          ))}
        </nav>


        <div className={styles.readerFrame}>
        <div ref={readerRef} className={styles.reader} role="region" aria-label="当前题目" onChange={event => {
          const target = event.target;
          if (!(target instanceof HTMLInputElement) || !target.closest("[data-choice-layout]")) return;
          cancelQuestionTransition();
          if (target.type === "checkbox") {
            const question = valuesQuestions.find(item => item.key === target.name);
            const selectedCount = target.closest("fieldset")?.querySelectorAll('input[type="checkbox"]:checked').length;
            if (!question?.selectionLimit || selectedCount !== question.selectionLimit) return;
          } else if (target.type !== "radio") return;
          autoAdvanceTimer.current = setTimeout(() => {
            if (!lastReaderQuestion) openQuestion(activeTab, currentIndex + 1, true);
            else if (nextReaderModule) openQuestion(nextReaderModule.id, 0, true);
          }, 300);
        }}>
          <div className={styles.readerToolbar}><span><span className={styles.desktopOnly}>{PROFILE_TABS.find(tab => tab.id === activeTab)?.label} · </span>{currentIndex + 1} / {moduleItems.length}</span><progress className={styles.desktopProgress} aria-label="当前模块进度" max={Math.max(1, moduleItems.length)} value={currentIndex + 1} /><button type="button" onClick={() => directoryRef.current?.showModal()} aria-label="题目目录"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5h12M9 12h12M9 19h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><circle cx="3" cy="5" r="1.5" fill="currentColor"/><circle cx="3" cy="12" r="1.5" fill="currentColor"/><circle cx="3" cy="19" r="1.5" fill="currentColor"/></svg><span>题目目录</span></button></div>
        {/* ── 关于你 ── */}
        {(
          <div data-reader-module="self" hidden={activeTab !== "self"} className={`${dcx("app-q-group")} ${styles.selfFlat}`}>
            <section className={styles.identity} aria-label="自我介绍">
              <div className={styles.sectionHeading}><h2>自我介绍</h2><p>对匹配对象展示</p></div>
              <div className={styles.introductionCard}>
              <label data-reader-item data-reader-title="昵称" id={profileAttentionElementId("nickname")}>昵称<span className={styles.nameInput}><input value={displayName} maxLength={30} onChange={(event) => setDisplayName(event.target.value)} placeholder="希望 TA 怎样称呼你" /></span></label>
              <label data-reader-item data-reader-title="一句话介绍" className={styles.introQuestion} id={profileAttentionElementId(HARD_MATCH_KEYS.oneLinerIntro)}>一句话介绍<span className={styles.introHint}>让对方从一句话开始了解你</span><span className={styles.introEditor}><textarea rows={5} maxLength={HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH} value={hardMatchForm.oneLinerIntro} onChange={(event) => setHardMatchForm((form) => ({ ...form, oneLinerIntro: event.target.value }))} placeholder="比如：喜欢散步和独立电影，期待遇见能一起分享日常的人。" /><span className={styles.charCount}>{hardMatchForm.oneLinerIntro.length} / {HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH}</span></span></label>
              </div>
            <div data-reader-item aria-label="联系方式"><ContactEditor key={initialUser.id} userId={initialUser.id} onStatus={setContactSaveStatus} onNavigateBlocked={() => openQuestion("self", 2)} initial={initialContactPreferences} email={initialUser.email} /></div>
            </section>
            <section className={styles.basicSection} aria-label="出生日期、性别与颜值自评">

            <div className={dcx("question-list")}>
              <QuestionField data-reader-item
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
                <div className={styles.birthControls}>
                  <select aria-label="出生年份" value={hardMatchForm.birthYear} onChange={event => setHardMatchForm(form => ({ ...form, birthYear: event.target.value, birthDay: "" }))}><option value="">年</option>{BIRTH_YEAR_OPTIONS.map(year => <option key={year} value={year}>{year} 年</option>)}</select>
                  <select aria-label="出生月份" value={hardMatchForm.birthMonth} onChange={event => setHardMatchForm(form => ({ ...form, birthMonth: event.target.value, birthDay: "" }))}><option value="">月</option>{Array.from({length:12}, (_,i) => i+1).map(month => <option key={month} value={month}>{month} 月</option>)}</select>
                  <select aria-label="出生日期中的日" value={hardMatchForm.birthDay} disabled={!hardMatchForm.birthYear || !hardMatchForm.birthMonth} onChange={event => setHardMatchForm(form => ({ ...form, birthDay: event.target.value }))}><option value="">日</option>{Array.from({length: new Date(Number(hardMatchForm.birthYear) || 2000, Number(hardMatchForm.birthMonth) || 1, 0).getDate()}, (_,i) => i+1).map(day => <option key={day} value={day}>{day} 日</option>)}</select>
                <BirthDatePicker
                  minYear={Math.min(...BIRTH_YEAR_OPTIONS)} maxYear={Math.max(...BIRTH_YEAR_OPTIONS)}
                  value={hardMatchForm.birthYear && hardMatchForm.birthMonth && hardMatchForm.birthDay ? `${hardMatchForm.birthYear}-${hardMatchForm.birthMonth.padStart(2, "0")}-${hardMatchForm.birthDay.padStart(2, "0")}` : ""}
                  onChange={value => {
                    const [birthYear, birthMonth, birthDay] = value.split("-");
                    setHardMatchForm(form => ({ ...form, birthYear, birthMonth: String(Number(birthMonth)), birthDay: String(Number(birthDay)) }));
                  }}
                />
                </div>
                {hardMatchForm.birthYear && hardMatchForm.birthMonth && hardMatchForm.birthDay && <p className={styles.rangeSummary}>你现在 <strong>{calculateAgeOnDate(`${hardMatchForm.birthYear}-${hardMatchForm.birthMonth.padStart(2,"0")}-${hardMatchForm.birthDay.padStart(2,"0")}`, new Date())}</strong> 岁</p>}
              </QuestionField>

              <QuestionField data-reader-item
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
                <QuestionChoices layout="list">
                  {HARD_MATCH_GENDERS.map((g, i) => (
                    <ChoiceOption key={g}>
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
                    </ChoiceOption>
                  ))}
                </QuestionChoices>
              </QuestionField>



              <QuestionField data-reader-item
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
                <ScaleChoice unit="分" label="颜值自评" name="looks" value={hardMatchForm.looks} options={HARD_MATCH_LOOKS.map(value => ({ value, label: value }))} onChange={looks => setHardMatchForm(form => ({ ...form, looks }))} />
                <p className={styles.ratingDescription}>{LOOKS_DESCRIPTIONS[Number(hardMatchForm.looks)] || "选择一个分数，查看对应说明。"}</p>
              </QuestionField>

            </div></section>
            <section className={styles.basicSection} aria-label="身高与体重"><div className={dcx("question-list")}>
              <QuestionField data-reader-item
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
                  options={questionOptions(buildDashboardFieldId("height-cm"), HEIGHT_VALUE_OPTIONS, hardMatchForm.heightCm)}
                  suffix="cm"
                  placeholder="请选择身高"
                  sheetTitle="选择你的身高"
                  onChange={(next) =>
                    setHardMatchForm((f) => ({ ...f, heightCm: next }))
                  }
                />
              </QuestionField>

              <QuestionField data-reader-item
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
                  options={questionOptions(buildDashboardFieldId("weight-kg"), WEIGHT_VALUE_OPTIONS, hardMatchForm.weightKg)}
                  placeholder="请选择体重"
                  sheetTitle="选择你的体重"
                  onChange={(next) =>
                    setHardMatchForm((f) => ({ ...f, weightKg: next }))
                  }
                />
              </QuestionField>

            </div>
            </section>
            <section className={styles.lifestyleSection} aria-label="锻炼、吸烟与饮酒">
              <div className={dcx("question-list")}>
                {lifestyleQuestions.map(question => <QuestionField data-reader-item key={question.key}
                  id={profileAttentionElementId(question.key)}
                  ref={node => setAttentionBlockRef([question.key], node)}
                  className={attentionBlockClassName([question.key])}>
                  {renderQuestionBlockHeading(question.key === "exercise_frequency" ? "锻炼情况" : question.prompt)}
                  {renderAttentionNote([question.key])}
                  <QuestionChoices layout="list">
                    {question.options?.map(option => <ChoiceOption key={option.value}>
                      <input type="radio" name={question.key} checked={answers[question.key] === option.value}
                        onChange={() => setAnswers(current => ({ ...current, [question.key]: option.value }))} />
                      <span>{option.label}</span>
                    </ChoiceOption>)}
                  </QuestionChoices>

                </QuestionField>)}
              </div>
            </section>
          </div>
        )}

        {/* ── 对方条件 ── */}
        {(
          <div data-reader-module="partner" hidden={activeTab !== "partner"} className={dcx("app-q-group")}>
            <div className={dcx("question-list")}>
              <section className={styles.partnerBasics} aria-label="希望对方年龄与性别">
              <QuestionField data-reader-item
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
                {renderQuestionBlockHeading("希望对方年龄")}
                {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.partnerAge)}
                <div className={styles.ageInputs}>
                  <label>
                    <span>年龄下限</span>
                    <ValuePicker
                      id={buildDashboardFieldId("partner-age-min")}
                      name="partnerAgeMin"
                      value={hardMatchForm.partnerAgeMin}
                      options={questionOptions(buildDashboardFieldId("partner-age-min"), AGE_VALUE_OPTIONS, hardMatchForm.partnerAgeMin)}
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
                      options={questionOptions(buildDashboardFieldId("partner-age-max"), AGE_VALUE_OPTIONS, hardMatchForm.partnerAgeMax)}
                      suffix="岁"
                      placeholder="请选择"
                      sheetTitle="对方年龄上限"
                      onChange={(next) =>
                        setHardMatchForm((f) => ({ ...f, partnerAgeMax: next }))
                      }
                    />
                  </label>
                </div>
                <p className={styles.rangeSummary}>{hardMatchForm.partnerAgeMin} — {hardMatchForm.partnerAgeMax} 岁</p>
              </QuestionField>

              <QuestionField data-reader-item
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
                <QuestionChoices layout="list">
                  {HARD_MATCH_GENDERS.map((g, i) => {
                    const active = hardMatchForm.partnerGenders.includes(g);
                    return (
                      <ChoiceOption
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
                      </ChoiceOption>
                    );
                  })}
                </QuestionChoices>
              </QuestionField>



              </section>

              <QuestionField data-reader-item className={styles.partnerLifestyle} id={profileAttentionElementId(HARD_MATCH_KEYS.partnerSmokingStatus)}>
                {renderQuestionBlockHeading("希望对方吸烟情况")}

                <p>可多选，选择你能接受的情况</p>
                <QuestionChoices layout="list">
                  <ChoiceOption><input type="checkbox" checked={!(hardMatchForm.partnerSmokingStatus?.length)} onChange={() => setHardMatchForm(form => ({ ...form, partnerSmokingStatus: [] }))} /><span>不限</span></ChoiceOption>
                  {LIFESTYLE_QUESTIONS[1].options.map(option => <ChoiceOption key={option}>
                    <input type="checkbox" checked={hardMatchForm.partnerSmokingStatus?.includes(option) ?? false} onChange={() => setHardMatchForm(form => ({ ...form, partnerSmokingStatus: toggleMultiSelectValue(form.partnerSmokingStatus ?? [], option) }))} /><span>{option}</span>
                  </ChoiceOption>)}
                </QuestionChoices>
              </QuestionField>

              <QuestionField data-reader-item className={styles.partnerLifestyle} id={profileAttentionElementId(HARD_MATCH_KEYS.partnerDrinkingFrequency)}>
                {renderQuestionBlockHeading("希望对方饮酒频率")}

                <p>可多选，选择你能接受的情况</p>
                <QuestionChoices layout="list">
                  <ChoiceOption><input type="checkbox" checked={!(hardMatchForm.partnerDrinkingFrequency?.length)} onChange={() => setHardMatchForm(form => ({ ...form, partnerDrinkingFrequency: [] }))} /><span>不限</span></ChoiceOption>
                  {LIFESTYLE_QUESTIONS[2].options.map(option => <ChoiceOption key={option}>
                    <input type="checkbox" checked={hardMatchForm.partnerDrinkingFrequency?.includes(option) ?? false} onChange={() => setHardMatchForm(form => ({ ...form, partnerDrinkingFrequency: toggleMultiSelectValue(form.partnerDrinkingFrequency ?? [], option) }))} /><span>{option}</span>
                  </ChoiceOption>)}
                </QuestionChoices>
              </QuestionField>

              <QuestionField data-reader-item className={styles.partnerLifestyle} id={profileAttentionElementId(HARD_MATCH_KEYS.partnerExerciseFrequency)}>
                {renderQuestionBlockHeading("希望对方锻炼频率")}
                <p className={styles.premiumHint}>高级筛选 · {vipActive ? "VIP 已启用" : "需要 VIP，开通后可设置"}</p>
                <p>可多选，选择你能接受的情况</p>
                <QuestionChoices layout="list">
                  <ChoiceOption><input type="checkbox" checked={!(hardMatchForm.partnerExerciseFrequency?.length)} onChange={() => updatePremiumForm(form => ({ ...form, partnerExerciseFrequency: [] }))} /><span>不限</span></ChoiceOption>
                  {LIFESTYLE_QUESTIONS[0].options.map(option => <ChoiceOption key={option}>
                    <input type="checkbox" checked={hardMatchForm.partnerExerciseFrequency?.includes(option) ?? false} onChange={() => updatePremiumForm(form => ({ ...form, partnerExerciseFrequency: toggleMultiSelectValue(form.partnerExerciseFrequency ?? [], option) }))} /><span>{option}</span>
                  </ChoiceOption>)}
                </QuestionChoices>
              </QuestionField>
              <div className={styles.premiumFields}>
              <QuestionField data-reader-item
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
                {renderQuestionBlockHeading("希望对方的颜值至少几分？")}
                <p className={styles.premiumHint}>高级筛选 · {vipActive ? "VIP 已启用" : "需要 VIP，开通后可设置"}</p>
                {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.partnerLooks)}
                <ScaleChoice unit="分及以上" name="partnerLooksMinimum" label="对方颜值最低分" value={hardMatchForm.partnerLooks.some(value => Number.isFinite(Number(value))) ? String(Math.min(...hardMatchForm.partnerLooks.map(Number).filter(Number.isFinite))) : "1"} options={HARD_MATCH_LOOKS.map(value => ({ value, label: `${value}分及以上` }))} onChange={value => updatePremiumForm(form => ({ ...form, partnerLooks: HARD_MATCH_LOOKS.filter(score => Number(score) >= Number(value)) }))} />
                <p className={styles.ratingDescription}>{hardMatchForm.partnerLooks.length ? `${Math.min(...hardMatchForm.partnerLooks.map(Number).filter(Number.isFinite), 10)} 分及以上` : "1 分及以上"}</p>

              </QuestionField>

              <QuestionField data-reader-item
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
                {renderQuestionBlockHeading("希望对方的身高范围")}
                <p className={styles.premiumHint}>高级筛选 · {vipActive ? "VIP 已启用" : "需要 VIP，开通后可设置"}</p>
                {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.partnerHeight)}
                <div className={dcx("form-grid")}>
                  <label>
                    <span>最低</span>
                    <ValuePicker
                      id={buildDashboardFieldId("partner-height-min")}
                      name="partnerHeightMin"
                      value={hardMatchForm.partnerHeightMin}
                      options={questionOptions(buildDashboardFieldId("partner-height-min"), HEIGHT_VALUE_OPTIONS, hardMatchForm.partnerHeightMin)}
                      suffix="cm"
                      placeholder="请选择"
                      sheetTitle="希望对方身高下限"
                      onChange={(next) =>
                        updatePremiumForm((f) => ({
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
                      options={questionOptions(buildDashboardFieldId("partner-height-max"), HEIGHT_VALUE_OPTIONS, hardMatchForm.partnerHeightMax)}
                      suffix="cm"
                      placeholder="请选择"
                      sheetTitle="希望对方身高上限"
                      onChange={(next) =>
                        updatePremiumForm((f) => ({
                          ...f,
                          partnerHeightMax: next,
                        }))
                      }
                    />
                  </label>
                </div>
              </QuestionField>

              <QuestionField data-reader-item
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
                {renderQuestionBlockHeading("希望对方的体重范围")}
                <p className={styles.premiumHint}>高级筛选 · {vipActive ? "VIP 已启用" : "需要 VIP，开通后可设置"}</p>
                {renderAttentionNote(HARD_MATCH_FIELD_KEY_GROUPS.partnerWeight)}
                <div className={dcx("form-grid")}>
                  <label>
                    <span>最低</span>
                    <ValuePicker
                      id={buildDashboardFieldId("partner-weight-min")}
                      name="partnerWeightMin"
                      value={hardMatchForm.partnerWeightMin}
                      options={questionOptions(buildDashboardFieldId("partner-weight-min"), PARTNER_WEIGHT_VALUE_OPTIONS, hardMatchForm.partnerWeightMin)}
                      placeholder="不限"
                      sheetTitle="希望对方体重下限"
                      onChange={(next) =>
                        updatePremiumForm((f) => ({
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
                      options={questionOptions(buildDashboardFieldId("partner-weight-max"), PARTNER_WEIGHT_VALUE_OPTIONS, hardMatchForm.partnerWeightMax)}
                      placeholder="不限"
                      sheetTitle="希望对方体重上限"
                      onChange={(next) =>
                        updatePremiumForm((f) => ({
                          ...f,
                          partnerWeightMax: next,
                        }))
                      }
                    />
                  </label>
                </div>
              </QuestionField>

              <QuestionField data-reader-item
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
                <p className={styles.premiumHint}>高级筛选 · {vipActive ? "VIP 已启用" : "需要 VIP，开通后可设置"}</p>
                {renderAttentionNote(
                  HARD_MATCH_FIELD_KEY_GROUPS.excludedPartnerSchools,
                )}
                <p className={dcx("app-muted")}>
                  可排除不希望匹配的学校或性别。
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
                <input className={styles.schoolSearch} aria-label="搜索学校" placeholder="搜索学校名称" value={schoolSearch} onChange={event => setSchoolSearch(event.target.value)} />
                <div className={styles.schoolList}>
                  {schoolOptions.filter(school => school.name.includes(schoolSearch.trim())).map((school, i) => {
                    const activeGenders = activeExcludedGendersFor(
                      hardMatchForm,
                      school.id,
                    );
                    const isFullyExcluded =
                      activeGenders.length === HARD_MATCH_GENDERS.length;
                    const isPartiallyExcluded =
                      !isFullyExcluded && activeGenders.length > 0;
                    return (
                      <details key={school.id} className={styles.schoolRow}>
                        <summary className={styles.schoolSummary}>
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
                          ) : <span className={styles.schoolStatus}>不排除</span>}
                          <svg className={styles.schoolChevron} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </summary>
                        <div
                          className={dcx("school-exclusion-genders")}
                          role="group"
                          aria-label={`${school.name} 排除性别`}
                        >
                          {HARD_MATCH_GENDERS.map((gender, genderIndex) => {
                            const active = activeGenders.includes(gender);
                            return (
                              <ChoiceOption
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
                                    vipActive ? toggleExcludedPartnerSchoolGender(school.id, gender) : vipDialogRef.current?.showModal()
                                  }
                                />
                                <span>{gender}</span>
                              </ChoiceOption>
                            );
                          })}
                        </div>
                      </details>
                    );
                  })}
                  {!schoolOptions.some(school => school.name.includes(schoolSearch.trim())) && <p>没有找到匹配的学校</p>}
                </div>
              </QuestionField>
              </div>
            </div>
          </div>
        )}

        {/* ── 价值观问卷 ── */}
        {valuesQuestions.length > 0 && (
          <div data-reader-module="values" hidden={activeTab !== "values"} className={dcx("app-q-group")}>
            <p className={styles.moduleDescription}>共 {valuesQuestions.length} 题，帮助算法了解你的价值观与相处偏好。</p>
            <div className={dcx("question-list")}>
              {valuesQuestions.map((question, questionIndex) => {
                const value = answers[question.key];
                const attentionItem = questionAttentionByKey.get(question.key);
                const showQuestionAttention =
                  attentionItem != null &&
                  (attentionItem.missingRequired ||
                    (attentionItem.updated && !attentionItem.acknowledged));
                const questionTitle = <QuestionHeading>{question.prompt}</QuestionHeading>;

                if (question.type === "MULTI_SELECT") {
                  const selected = Array.isArray(value) ? value : [];
                  const selectionLimit = question.selectionLimit ?? null;
                  const reachedSelectionLimit =
                    selectionLimit != null && selected.length >= selectionLimit;
                  return (
                    <QuestionField data-reader-item
                      key={question.id}
                      ref={(node) =>
                        setAttentionBlockRef([question.key], node)
                      }
                      id={profileAttentionElementId(question.key)}
                      className={attentionBlockClassName([question.key])}
                    >
                      {questionTitle}
                      {showQuestionAttention && attentionItem ? (
                        <p className={dcx("question-attention-note")}>
                          {questionnaireAttentionText(attentionItem)}
                        </p>
                      ) : null}
                      {selectionLimit != null ? (
                        <p className={dcx("app-muted")}>
                          本题必须选择 {selectionLimit} 项。
                        </p>
                      ) : null}
                      <QuestionChoices layout={questionIndex < 14 || question.options?.some(option => option.label.length > 12) ? "list" : "tiles"}>
                        {question.options?.map((option, optionIndex) => {
                          const active = selected.includes(option.value);
                          return (
                            <ChoiceOption
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
                            </ChoiceOption>
                          );
                        })}
                      </QuestionChoices>
                    </QuestionField>
                  );
                }

                return (
                  <QuestionField data-reader-item
                    key={question.id}
                    ref={(node) => setAttentionBlockRef([question.key], node)}
                    id={profileAttentionElementId(question.key)}
                    className={attentionBlockClassName([question.key])}
                  >
                    {questionTitle}
                    {showQuestionAttention && attentionItem ? (
                      <p className={dcx("question-attention-note")}>
                        {questionnaireAttentionText(attentionItem)}
                      </p>
                    ) : null}
                    <QuestionChoices layout={questionIndex < 14 || question.options?.some(option => option.label.length > 12) ? "list" : "tiles"}>
                      {question.options?.map((option, optionIndex) => (
                        <ChoiceOption key={option.value}>
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
                        </ChoiceOption>
                      ))}
                    </QuestionChoices>
                  </QuestionField>
                );
              })}
            </div>
          </div>
        )}
        </div>
          <ReaderScrollHint readerRef={readerRef} question={moduleItems[currentIndex]?.node} />
        </div>
        <footer className={styles.moduleFooter}>
          <div className={styles.readerProgress}><span>{incompleteTargets.length ? `还有 ${incompleteTargets.length} 题待完善` : '必答项已完成'}</span><button type="button" onClick={() => incompleteTargets.length ? locateIncomplete() : setCompletedSnapshot(questionnaireSnapshot)}>{incompleteTargets.length ? '去补全 →' : '完成问卷'}</button></div>
          <div className={styles.moduleActions}>
            <button className={styles.previousModule} type="button" disabled={currentIndex === 0 && !previousReaderModule} onClick={() => currentIndex > 0 ? openQuestion(activeTab, currentIndex - 1) : previousReaderModule && openQuestion(previousReaderModule.id, Math.max(0, readerItems.filter(item => item.tab === previousReaderModule.id).length - 1))}>{currentIndex === 0 && previousReaderModule ? "← 上一模块" : "← 上一题"}</button>
            <button className={styles.desktopComplete} type="button" onClick={() => incompleteTargets.length ? locateIncomplete() : setCompletedSnapshot(questionnaireSnapshot)}>{incompleteTargets.length ? "去补全" : "完成问卷"}</button>
            <button className={styles.nextModule} type="button" disabled={lastReaderQuestion && !nextReaderModule && !incompleteTargets.length && savePresentation.tone !== "saved"} onClick={() => !lastReaderQuestion ? openQuestion(activeTab, currentIndex + 1) : nextReaderModule ? openQuestion(nextReaderModule.id, 0) : finishReader()}>{!lastReaderQuestion ? "下一题 →" : nextReaderModule ? "下一模块 →" : incompleteTargets.length ? `补全 ${incompleteTargets.length} 题 →` : "完成"}</button>
          </div>
          {completedSnapshot === questionnaireSnapshot && savePresentation.tone === "saved" ? <p className={styles.completionSuccess} role="status">保存成功，问卷已填写完成。</p> : null}
        </footer>
        <dialog ref={vipDialogRef} className={styles.vipDialog} aria-labelledby="vip-unlock-title" onClick={event => { if (event.target === event.currentTarget) vipDialogRef.current?.close(); }}>
          <span className={styles.vipEyebrow}>LiLink VIP</span>
          <h2 id="vip-unlock-title">开通 VIP，设置高级筛选</h2>
          <p>学校、身高、体重和颜值偏好是 VIP 专享功能。开通后，你的筛选条件才会用于匹配。</p>
          <Link href="/dashboard/vip" className={styles.vipDialogCta}>查看权益与开通</Link>
          <button type="button" onClick={() => vipDialogRef.current?.close()}>暂不开通，继续填写</button>
        </dialog>
        <dialog ref={directoryRef} className={styles.directory} aria-labelledby="question-directory-title" onClick={event => { if (event.target === event.currentTarget) directoryRef.current?.close(); }}>
          <div className={styles.directoryHeader}><h2 id="question-directory-title">题目目录</h2><button type="button" aria-label="关闭题目目录" onClick={() => directoryRef.current?.close()}>×</button></div>
          <p>按模块查看，点击题号跳转</p>
          <div className={styles.directoryLegend}><span>● 已答</span><span>○ 未答</span><span>◎ 当前</span></div>
          <div className={styles.directoryBody}>
          {PROFILE_TABS.map(tab => {
            const items = readerItems.filter(item => item.tab === tab.id);
            return <section key={tab.id}><h3>{tab.label}<small>{items.filter(item => !itemIncomplete(item)).length} / {items.length}</small></h3><div className={styles.numberGrid}>{items.map((item, index) => <button type="button" key={index} aria-label={`${tab.label}第 ${index + 1} 题：${item.title}`} aria-current={activeTab === tab.id && currentIndex === index ? 'step' : undefined} data-complete={!itemIncomplete(item)} onClick={() => openQuestion(tab.id, index)}>{String(index + 1).padStart(2, '0')}</button>)}</div></section>;
          })}
          </div>
        </dialog>
      </section>
    </div>
  );
}

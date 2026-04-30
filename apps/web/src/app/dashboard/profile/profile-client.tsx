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
  HARD_MATCH_LANGUAGES,
  HARD_MATCH_LOOKS,
  HARD_MATCH_NATIONALITIES,
  HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH,
  HEIGHT_OPTIONS,
  MONTH_OPTIONS,
  WEIGHT_OPTIONS,
  buildDayOptions,
  hardMatchFormFromAnswers,
  hardMatchGenderLabel,
  hardMatchLanguageLabel,
  hardMatchLooksLabel,
  hardMatchNationalityLabel,
  schoolGenderExclusionFor,
  setSchoolGenderExclusion,
  toggleMultiSelectValue,
  type HardMatchFormState,
  type HardMatchSchoolOption,
} from "../../../lib/hard-match";
import { useDashboardSessionSeed } from "../_components/DashboardSessionSeed";
import { ValuePicker, type ValuePickerOption } from "../_components/ValuePicker";
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
import { useLocale } from "../../locale-context";

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
const MULTI_CHOICE_PREVIEW_LIMIT = 4;

type ProfileTab = "self" | "partner" | "values";

const PROFILE_COPY = {
  "zh-CN": {
    tabs: {
      self: "关于你",
      partner: "希望 TA",
      values: "价值观问卷",
    },
    pending: "检测到修改，系统即将自动保存。",
    saving: "正在自动保存…",
    error: "自动保存暂时失败，请查看下方提示。",
    draftSavedAfterSubmitted:
      "未完成修改已自动保存为草稿；当前匹配仍按上次正式保存的完整问卷计算。",
    draftSaved:
      "草稿已自动保存；补全全部必答项后，系统会自动转为正式问卷。",
    submitted: "问卷已自动保存。",
    idle: "系统会自动保存你的修改。",
    stale:
      "当前页面数据已失效或填写内容未通过校验，请刷新页面后重试。",
    failedFinal: "问卷自动保存多次失败，请检查当前填写内容后立即重试。",
    failedRetry: (seconds: number) =>
      `问卷自动保存失败，系统将在 ${seconds} 秒后自动重试。`,
    statusDraft: "草稿中",
    statusUnsaved: "未保存",
    statusSavedDraft: "已保存 · 草稿待补全",
    statusSaved: "已保存 · 完整",
    title: "客观条件与价值观",
    introDraft:
      "你有一份未完成草稿；当前匹配仍按最近一次正式保存的完整问卷计算。补全后系统会自动切换到最新版本。",
    introSaved:
      "匹配以你最近一次正式保存的内容计算；你在这里的修改会自动保存并用于后续轮次。",
    introNew:
      "在这里填写问卷资料。系统会自动保存草稿；补全全部必答项后，会自动转为正式问卷。",
    autosaveHint: "系统会在你停止输入片刻后自动保存当前编辑内容。",
    retry: "立即重试",
    tabAria: "问卷分组",
    selfIcon: "我",
    selfTitle: "关于你",
    selfSubtitle: "你的基本客观信息",
    birthDate: "出生日期",
    year: "年份",
    month: "月份",
    day: "日期",
    select: "请选择",
    selectBirthYear: "选择出生年份",
    selectBirthMonth: "选择出生月份",
    selectBirthDay: "选择出生日期",
    gender: "性别",
    nationality: "国籍",
    selectNationality: "请选择国籍",
    selectYourNationality: "选择你的国籍",
    languages: "语言（可多选）",
    selectLanguages: "选择语言",
    languagesEmpty: "请选择至少一种",
    searchLanguages: "搜索语言",
    looks: "颜值自评",
    height: "身高（厘米）",
    selectHeight: "选择你的身高",
    weight: "体重（公斤）",
    weightOptional: "不填写",
    selectWeight: "选择你的体重",
    nickname: "昵称",
    nicknameHint: "昵称，引荐后会发给对方邮件，可以是真名也可以不是。",
    nicknamePlaceholder: "输入你的昵称",
    introLine: "一句话介绍",
    introLineHint:
      "用一两句话介绍你的兴趣或期待；引荐邮件中会展示给对方。请勿填写隐私敏感信息。",
    introLinePlaceholder: "例如：喜欢徒步和电影，希望认识聊得来的朋友。",
    partnerTitle: "对方条件",
    partnerSubtitle: "你希望匹配对象满足的条件",
    partnerAge: "希望对方的年龄范围",
    ageMin: "年龄下限",
    ageMax: "年龄上限",
    ageSuffix: "岁",
    selectPartnerAgeMin: "希望对方年龄下限",
    selectPartnerAgeMax: "希望对方年龄上限",
    partnerGender: "希望对方的性别（可多选）",
    partnerNationality: "希望对方的国籍",
    selectPartnerNationality: "选择希望对方的国籍",
    partnerNationalityEmpty: "不限",
    searchNationalities: "搜索国籍",
    partnerLanguages: "希望对方的语言",
    selectPartnerLanguages: "选择希望对方的语言",
    partnerLanguagesEmpty: "不限",
    partnerLooks: "希望对方的颜值（可多选）",
    partnerHeight: "希望对方的身高范围（厘米）",
    heightMin: "身高下限",
    heightMax: "身高上限",
    selectPartnerHeightMin: "希望对方身高下限",
    selectPartnerHeightMax: "希望对方身高上限",
    partnerWeight: "希望对方的体重范围（公斤）",
    weightMin: "体重下限",
    weightMax: "体重上限",
    selectPartnerWeightMin: "希望对方体重下限",
    selectPartnerWeightMax: "希望对方体重上限",
    noLimit: "不限",
    schoolExclusion: "按学校排除（可选）",
    schoolExclusionHint:
      "在每所学校上，勾选你不希望匹配的性别。三项全选即整校排除。",
    fullyExcluded: "整校排除",
    excludedPrefix: "已排除：",
    excludedGenderAria: (schoolName: string) => `${schoolName} 排除性别`,
    valuesTitle: "价值观问卷",
    valuesSubtitle: (count: number) => `共 ${count} 题，作为匹配算法的核心输入`,
    selectionLimit: (count: number) => `本题最多选择 ${count} 项。`,
    selectedCount: (count: number) => `已选 ${count} 项`,
    choose: "选择",
    close: "关闭",
    done: "完成",
    weightLabel: (weight: number | string) => `${weight} kg`,
    yearLabel: (year: number | string) => `${year} 年`,
    monthLabel: (month: number | string) => `${month} 月`,
    dayLabel: (day: number | string) => `${day} 日`,
  },
  "en-US": {
    tabs: {
      self: "About you",
      partner: "Partner",
      values: "Values",
    },
    pending: "Changes detected. Autosave will run soon.",
    saving: "Autosaving...",
    error: "Autosave failed for now. See the message below.",
    draftSavedAfterSubmitted:
      "Incomplete changes were saved as a draft. Matching still uses your last complete questionnaire.",
    draftSaved:
      "Draft saved. Once all required fields are complete, it will become your formal questionnaire.",
    submitted: "Questionnaire saved.",
    idle: "Your changes are saved automatically.",
    stale:
      "This page is stale or some answers failed validation. Refresh and try again.",
    failedFinal:
      "Questionnaire autosave failed repeatedly. Check your answers and retry now.",
    failedRetry: (seconds: number) =>
      `Questionnaire autosave failed. The system will retry in ${seconds} seconds.`,
    statusDraft: "Draft",
    statusUnsaved: "Unsaved",
    statusSavedDraft: "Saved · draft incomplete",
    statusSaved: "Saved · complete",
    title: "Objective Details and Values",
    introDraft:
      "You have an incomplete draft. Matching still uses your latest complete questionnaire until this draft is complete.",
    introSaved:
      "Matching uses your latest complete questionnaire. Changes here are autosaved for future rounds.",
    introNew:
      "Fill out your questionnaire here. Drafts are autosaved and become formal once all required fields are complete.",
    autosaveHint: "The system autosaves shortly after you stop editing.",
    retry: "Retry now",
    tabAria: "Questionnaire sections",
    selfIcon: "Me",
    selfTitle: "About you",
    selfSubtitle: "Your basic objective information",
    birthDate: "Date of birth",
    year: "Year",
    month: "Month",
    day: "Day",
    select: "Select",
    selectBirthYear: "Select birth year",
    selectBirthMonth: "Select birth month",
    selectBirthDay: "Select birth day",
    gender: "Gender",
    nationality: "Nationality",
    selectNationality: "Select nationality",
    selectYourNationality: "Select your nationality",
    languages: "Languages (multi-select)",
    selectLanguages: "Select languages",
    languagesEmpty: "Select at least one",
    searchLanguages: "Search languages",
    looks: "Appearance self-rating",
    height: "Height (cm)",
    selectHeight: "Select your height",
    weight: "Weight (kg)",
    weightOptional: "Prefer not to say",
    selectWeight: "Select your weight",
    nickname: "Display name",
    nicknameHint:
      "This name will be sent in the introduction email. It can be your real name or not.",
    nicknamePlaceholder: "Enter your display name",
    introLine: "One-line intro",
    introLineHint:
      "Introduce your interests or expectations in one or two sentences. Do not include sensitive private information.",
    introLinePlaceholder:
      "Example: I like hiking and films, and hope to meet someone easy to talk to.",
    partnerTitle: "Partner preferences",
    partnerSubtitle: "Conditions you hope your match satisfies",
    partnerAge: "Preferred partner age range",
    ageMin: "Minimum age",
    ageMax: "Maximum age",
    ageSuffix: "years old",
    selectPartnerAgeMin: "Minimum partner age",
    selectPartnerAgeMax: "Maximum partner age",
    partnerGender: "Preferred partner gender (multi-select)",
    partnerNationality: "Preferred partner nationality",
    selectPartnerNationality: "Select preferred nationalities",
    partnerNationalityEmpty: "No preference",
    searchNationalities: "Search nationalities",
    partnerLanguages: "Preferred partner languages",
    selectPartnerLanguages: "Select preferred languages",
    partnerLanguagesEmpty: "No preference",
    partnerLooks: "Preferred partner appearance (multi-select)",
    partnerHeight: "Preferred partner height range (cm)",
    heightMin: "Minimum height",
    heightMax: "Maximum height",
    selectPartnerHeightMin: "Minimum partner height",
    selectPartnerHeightMax: "Maximum partner height",
    partnerWeight: "Preferred partner weight range (kg)",
    weightMin: "Minimum weight",
    weightMax: "Maximum weight",
    selectPartnerWeightMin: "Minimum partner weight",
    selectPartnerWeightMax: "Maximum partner weight",
    noLimit: "No preference",
    schoolExclusion: "Exclude by school (optional)",
    schoolExclusionHint:
      "For each school, select genders you do not want to match with. Selecting all three excludes the whole school.",
    fullyExcluded: "Whole school excluded",
    excludedPrefix: "Excluded: ",
    excludedGenderAria: (schoolName: string) =>
      `${schoolName} excluded genders`,
    valuesTitle: "Values questionnaire",
    valuesSubtitle: (count: number) =>
      `${count} questions used as core matching inputs`,
    selectionLimit: (count: number) => `Choose up to ${count} options.`,
    selectedCount: (count: number) => `${count} selected`,
    choose: "Choose",
    close: "Close",
    done: "Done",
    weightLabel: (weight: number | string) => `${weight} kg`,
    yearLabel: (year: number | string) => String(year),
    monthLabel: (month: number | string) => String(month),
    dayLabel: (day: number | string) => String(day),
  },
} as const;

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

type MultiChoiceSummaryPickerProps = {
  id: string;
  name: string;
  title: string;
  values: string[];
  options: readonly string[];
  onChange: (next: string[]) => void;
  optionLabel?: (value: string) => string;
  emptyLabel?: string;
  searchPlaceholder?: string;
  allowEmpty?: boolean;
  selectedCountLabel: (count: number) => string;
  triggerLabel: string;
  closeLabel: string;
  doneLabel: string;
};

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
  copy: (typeof PROFILE_COPY)["zh-CN"] | (typeof PROFILE_COPY)["en-US"],
) {
  if (saveState === "pending") {
    return copy.pending;
  }

  if (saveState === "saving") {
    return copy.saving;
  }

  if (saveState === "error") {
    return copy.error;
  }

  if (saveState === "draft-saved" || hasDraftQuestionnaire) {
    return hasSavedQuestionnaire
      ? copy.draftSavedAfterSubmitted
      : copy.draftSaved;
  }

  if (saveState === "submitted") {
    return copy.submitted;
  }

  return copy.idle;
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
  copy: (typeof PROFILE_COPY)["zh-CN"] | (typeof PROFILE_COPY)["en-US"],
) {
  if (isApiRequestError(error) && error.status >= 400 && error.status < 500) {
    return copy.stale;
  }

  return retryDelayMs == null
    ? copy.failedFinal
    : copy.failedRetry(Math.ceil(retryDelayMs / 1000));
}

function activeExcludedGendersFor(
  hardMatchForm: HardMatchFormState,
  schoolId: string,
): readonly (typeof HARD_MATCH_GENDERS)[number][] {
  if (hardMatchForm.excludedPartnerSchools.includes(schoolId)) {
    return HARD_MATCH_GENDERS;
  }

  return schoolGenderExclusionFor(
    hardMatchForm.excludedPartnerSchoolGenders,
    schoolId,
  );
}

function MultiChoiceSummaryPicker({
  id,
  name,
  title,
  values,
  options,
  onChange,
  optionLabel = (value) => value,
  emptyLabel = "未选择",
  searchPlaceholder = "搜索",
  allowEmpty = false,
  selectedCountLabel,
  triggerLabel,
  closeLabel,
  doneLabel,
}: MultiChoiceSummaryPickerProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
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
      `${option} ${optionLabel(option)}`.toLocaleLowerCase().includes(query),
    );
  }, [optionLabel, options, search]);

  function openDialog() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function closeDialog() {
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
            {hasSelectedValues ? selectedCountLabel(values.length) : emptyLabel}
          </span>
          <div className="multi-choice-preview">
            {hasSelectedValues ? (
              <>
                {previewValues.map((value) => (
                  <span key={value} className="multi-choice-preview-chip">
                    {optionLabel(value)}
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
          onClick={openDialog}
        >
          {triggerLabel}
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
              aria-label={closeLabel}
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
                  <span>{optionLabel(option)}</span>
                </label>
              );
            })}
          </div>

          <div className="multi-choice-dialog-footer">
            <span>
              {hasSelectedValues ? selectedCountLabel(values.length) : emptyLabel}
            </span>
            <button
              type="button"
              className="multi-choice-done"
              onClick={closeDialog}
            >
              {doneLabel}
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
  const { locale } = useLocale();
  const copy = PROFILE_COPY[locale];
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
  const profileTabs = useMemo(
    () =>
      [
        { id: "self", label: copy.tabs.self },
        { id: "partner", label: copy.tabs.partner },
        { id: "values", label: copy.tabs.values },
      ] satisfies ReadonlyArray<{ id: ProfileTab; label: string }>,
    [copy.tabs],
  );
  const birthYearValueOptions = useMemo(
    () => numericOptions(BIRTH_YEAR_OPTIONS, copy.yearLabel),
    [copy],
  );
  const monthValueOptions = useMemo(
    () => numericOptions(MONTH_OPTIONS, copy.monthLabel),
    [copy],
  );
  const weightValueOptions = useMemo(
    () => [
      { value: "", label: copy.weightOptional },
      ...numericOptions(WEIGHT_OPTIONS, copy.weightLabel),
    ],
    [copy],
  );
  const partnerWeightValueOptions = useMemo(
    () => [
      { value: "", label: copy.noLimit },
      ...numericOptions(WEIGHT_OPTIONS, copy.weightLabel),
    ],
    [copy],
  );
  const nationalityOptionLabel = useMemo(
    () => (value: string) =>
      hardMatchNationalityLabel(
        value as (typeof HARD_MATCH_NATIONALITIES)[number],
        locale,
      ),
    [locale],
  );
  const languageOptionLabel = useMemo(
    () => (value: string) =>
      hardMatchLanguageLabel(value as (typeof HARD_MATCH_LANGUAGES)[number], locale),
    [locale],
  );
  const nationalityValueOptions = useMemo(
    () =>
      HARD_MATCH_NATIONALITIES.map((value) => ({
        value,
        label: nationalityOptionLabel(value),
      })),
    [nationalityOptionLabel],
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

  function toggleExcludedPartnerSchoolGender(schoolId: string, gender: string) {
    setHardMatchForm((current) => {
      const currentActive = activeExcludedGendersFor(current, schoolId);
      const nextActive = toggleMultiSelectValue([...currentActive], gender);
      const isNowFullyExcluded = nextActive.length === HARD_MATCH_GENDERS.length;
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
          questionnaireAutosaveFailureMessage(caughtError, retryDelayMs, copy),
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
        locale,
      ),
    [questions, answers, hardMatchForm, displayName, locale],
  );

  const hasSavedQuestionnaire = Boolean(dashboard?.questionnaireSubmittedAt);
  const questionnaireStatus = questionnaireAutosaveStatusText(
    questionnaireSaveState,
    hasSavedQuestionnaire,
    hasQuestionnaireDraft,
    copy,
  );
  const profileStatus: { label: string; tone: "on" | "warn" } =
    !hasSavedQuestionnaire
      ? hasQuestionnaireDraft
        ? { label: copy.statusDraft, tone: "warn" }
        : { label: copy.statusUnsaved, tone: "warn" }
      : hasQuestionnaireDraft
        ? { label: copy.statusSavedDraft, tone: "warn" }
        : { label: copy.statusSaved, tone: "on" };

  return (
    <div className="app-page-shell">
      <header className="app-page-header">
        <p className="eyebrow">Profile</p>
        <h1>{copy.title}</h1>
        <p>
          {hasSavedQuestionnaire
            ? hasQuestionnaireDraft
              ? copy.introDraft
              : copy.introSaved
            : copy.introNew}
        </p>
        <span
          className={
            profileStatus.tone === "on"
              ? "app-card-status is-on"
              : "app-card-status is-warn"
          }
        >
          {profileStatus.label}
        </span>
        <p className="app-muted">{questionnaireStatus}</p>
        {questionnaireSaveError ? (
          <p className="form-error">{questionnaireSaveError}</p>
        ) : null}
      </header>

      <section className="app-card">
        <div className="app-q-toolbar">
          <p className="app-muted">{copy.autosaveHint}</p>
          {questionnaireSaveError ? (
            <button
              className="button-secondary"
              type="button"
              onClick={() =>
                setQuestionnaireManualRetryTick((current) => current + 1)
              }
            >
              {copy.retry}
            </button>
          ) : null}
        </div>
        {questionnaireIncompleteMessage ? (
          <p className="form-error" role="alert">
            {questionnaireIncompleteMessage}
          </p>
        ) : null}

        <nav aria-label={copy.tabAria} className="app-section-tabs">
          {profileTabs.map((tab) => (
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

        {/* About you */}
        {activeTab === "self" && (
        <div className="app-q-group">
          <div className="app-q-group-header">
            <span className="app-q-group-icon app-q-group-icon-self">
              {copy.selfIcon}
            </span>
            <div>
              <h3>{copy.selfTitle}</h3>
              <p>{copy.selfSubtitle}</p>
            </div>
          </div>
          <div className="question-list">
            <fieldset className="question-block">
              <legend>{copy.birthDate}</legend>
              <div className="form-grid birth-date-grid">
                <label>
                  <span>{copy.year}</span>
                  <ValuePicker
                    id={buildDashboardFieldId("birth-year")}
                    name="birthYear"
                    value={hardMatchForm.birthYear}
                    options={birthYearValueOptions}
                    placeholder={copy.select}
                    sheetTitle={copy.selectBirthYear}
                    onChange={(next) =>
                      setHardMatchForm((f) => ({ ...f, birthYear: next }))
                    }
                  />
                </label>
                <label>
                  <span>{copy.month}</span>
                  <ValuePicker
                    id={buildDashboardFieldId("birth-month")}
                    name="birthMonth"
                    value={hardMatchForm.birthMonth}
                    options={monthValueOptions}
                    placeholder={copy.select}
                    sheetTitle={copy.selectBirthMonth}
                    onChange={(next) =>
                      setHardMatchForm((f) => ({ ...f, birthMonth: next }))
                    }
                  />
                </label>
                <label>
                  <span>{copy.day}</span>
                  <ValuePicker
                    id={buildDashboardFieldId("birth-day")}
                    name="birthDay"
                    value={hardMatchForm.birthDay}
                    options={numericOptions(birthDayOptions, copy.dayLabel)}
                    placeholder={copy.select}
                    sheetTitle={copy.selectBirthDay}
                    onChange={(next) =>
                      setHardMatchForm((f) => ({ ...f, birthDay: next }))
                    }
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="question-block">
              <legend>{copy.gender}</legend>
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
                    <span>{hardMatchGenderLabel(g, locale)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="question-block">
              <legend>{copy.nationality}</legend>
              <ValuePicker
                id={buildDashboardFieldId("nationality")}
                name="nationality"
                value={hardMatchForm.nationality}
                options={nationalityValueOptions}
                placeholder={copy.selectNationality}
                sheetTitle={copy.selectYourNationality}
                onChange={(next) =>
                  setHardMatchForm((f) => ({ ...f, nationality: next }))
                }
              />
            </fieldset>

            <fieldset className="question-block">
              <legend>{copy.languages}</legend>
              <MultiChoiceSummaryPicker
                id={buildDashboardFieldId("languages")}
                name="languages"
                title={copy.selectLanguages}
                values={hardMatchForm.languages}
                options={HARD_MATCH_LANGUAGES}
                optionLabel={languageOptionLabel}
                emptyLabel={copy.languagesEmpty}
                searchPlaceholder={copy.searchLanguages}
                selectedCountLabel={copy.selectedCount}
                triggerLabel={copy.choose}
                closeLabel={copy.close}
                doneLabel={copy.done}
                onChange={(next) =>
                  setHardMatchForm((f) => ({ ...f, languages: next }))
                }
              />
            </fieldset>

            <fieldset className="question-block">
              <legend>{copy.looks}</legend>
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
                    <span>{hardMatchLooksLabel(l, locale)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="question-block">
              <legend>{copy.height}</legend>
              <ValuePicker
                id={buildDashboardFieldId("height-cm")}
                name="heightCm"
                value={hardMatchForm.heightCm}
                options={HEIGHT_VALUE_OPTIONS}
                suffix="cm"
                placeholder={copy.selectHeight}
                sheetTitle={copy.selectHeight}
                onChange={(next) =>
                  setHardMatchForm((f) => ({ ...f, heightCm: next }))
                }
              />
            </fieldset>

            <fieldset className="question-block">
              <legend>{copy.weight}</legend>
              <ValuePicker
                id={buildDashboardFieldId("weight-kg")}
                name="weightKg"
                value={hardMatchForm.weightKg}
                options={weightValueOptions}
                placeholder={copy.weightOptional}
                sheetTitle={copy.selectWeight}
                onChange={(next) =>
                  setHardMatchForm((f) => ({ ...f, weightKg: next }))
                }
              />
            </fieldset>

            <fieldset className="question-block">
              <legend>{copy.nickname}</legend>
              <label className="dash-one-liner-label">
                <span className="app-muted">{copy.nicknameHint}</span>
                <input
                  id={buildDashboardFieldId("display-name")}
                  name="displayName"
                  type="text"
                  maxLength={30}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={copy.nicknamePlaceholder}
                />
              </label>
            </fieldset>

            <fieldset className="question-block">
              <legend>{copy.introLine}</legend>
              <label className="dash-one-liner-label">
                <span className="app-muted">{copy.introLineHint}</span>
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
                  placeholder={copy.introLinePlaceholder}
                />
              </label>
            </fieldset>
          </div>
        </div>
        )}

        {/* Partner preferences */}
        {activeTab === "partner" && (
        <div className="app-q-group">
          <div className="app-q-group-header">
            <span className="app-q-group-icon app-q-group-icon-partner">
              TA
            </span>
            <div>
              <h3>{copy.partnerTitle}</h3>
              <p>{copy.partnerSubtitle}</p>
            </div>
          </div>
          <div className="question-list">
            <fieldset className="question-block">
              <legend>{copy.partnerAge}</legend>
              <div className="form-grid">
                <label>
                  <span>{copy.ageMin}</span>
                  <ValuePicker
                    id={buildDashboardFieldId("partner-age-min")}
                    name="partnerAgeMin"
                    value={hardMatchForm.partnerAgeMin}
                    options={AGE_VALUE_OPTIONS}
                    suffix={copy.ageSuffix}
                    placeholder={copy.select}
                    sheetTitle={copy.selectPartnerAgeMin}
                    onChange={(next) =>
                      setHardMatchForm((f) => ({ ...f, partnerAgeMin: next }))
                    }
                  />
                </label>
                <label>
                  <span>{copy.ageMax}</span>
                  <ValuePicker
                    id={buildDashboardFieldId("partner-age-max")}
                    name="partnerAgeMax"
                    value={hardMatchForm.partnerAgeMax}
                    options={AGE_VALUE_OPTIONS}
                    suffix={copy.ageSuffix}
                    placeholder={copy.select}
                    sheetTitle={copy.selectPartnerAgeMax}
                    onChange={(next) =>
                      setHardMatchForm((f) => ({ ...f, partnerAgeMax: next }))
                    }
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="question-block">
              <legend>{copy.partnerGender}</legend>
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
                      <span>{hardMatchGenderLabel(g, locale)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="question-block">
              <legend>{copy.partnerNationality}</legend>
              <MultiChoiceSummaryPicker
                id={buildDashboardFieldId("partner-nationalities")}
                name="partnerNationalities"
                title={copy.selectPartnerNationality}
                values={hardMatchForm.partnerNationalities}
                options={HARD_MATCH_NATIONALITIES}
                optionLabel={nationalityOptionLabel}
                emptyLabel={copy.partnerNationalityEmpty}
                searchPlaceholder={copy.searchNationalities}
                allowEmpty
                selectedCountLabel={copy.selectedCount}
                triggerLabel={copy.choose}
                closeLabel={copy.close}
                doneLabel={copy.done}
                onChange={(next) =>
                  setHardMatchForm((f) => ({
                    ...f,
                    partnerNationalities: next,
                  }))
                }
              />
            </fieldset>

            <fieldset className="question-block">
              <legend>{copy.partnerLanguages}</legend>
              <MultiChoiceSummaryPicker
                id={buildDashboardFieldId("partner-languages")}
                name="partnerLanguages"
                title={copy.selectPartnerLanguages}
                values={hardMatchForm.partnerLanguages}
                options={HARD_MATCH_LANGUAGES}
                optionLabel={languageOptionLabel}
                emptyLabel={copy.partnerLanguagesEmpty}
                searchPlaceholder={copy.searchLanguages}
                allowEmpty
                selectedCountLabel={copy.selectedCount}
                triggerLabel={copy.choose}
                closeLabel={copy.close}
                doneLabel={copy.done}
                onChange={(next) =>
                  setHardMatchForm((f) => ({
                    ...f,
                    partnerLanguages: next,
                  }))
                }
              />
            </fieldset>

            <fieldset className="question-block">
              <legend>{copy.partnerLooks}</legend>
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
                      <span>{hardMatchLooksLabel(l, locale)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="question-block">
              <legend>{copy.partnerHeight}</legend>
              <div className="form-grid">
                <label>
                  <span>{copy.heightMin}</span>
                  <ValuePicker
                    id={buildDashboardFieldId("partner-height-min")}
                    name="partnerHeightMin"
                    value={hardMatchForm.partnerHeightMin}
                    options={HEIGHT_VALUE_OPTIONS}
                    suffix="cm"
                    placeholder={copy.select}
                    sheetTitle={copy.selectPartnerHeightMin}
                    onChange={(next) =>
                      setHardMatchForm((f) => ({
                        ...f,
                        partnerHeightMin: next,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>{copy.heightMax}</span>
                  <ValuePicker
                    id={buildDashboardFieldId("partner-height-max")}
                    name="partnerHeightMax"
                    value={hardMatchForm.partnerHeightMax}
                    options={HEIGHT_VALUE_OPTIONS}
                    suffix="cm"
                    placeholder={copy.select}
                    sheetTitle={copy.selectPartnerHeightMax}
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

            <fieldset className="question-block">
              <legend>{copy.partnerWeight}</legend>
              <div className="form-grid">
                <label>
                  <span>{copy.weightMin}</span>
                  <ValuePicker
                    id={buildDashboardFieldId("partner-weight-min")}
                    name="partnerWeightMin"
                    value={hardMatchForm.partnerWeightMin}
                    options={partnerWeightValueOptions}
                    placeholder={copy.noLimit}
                    sheetTitle={copy.selectPartnerWeightMin}
                    onChange={(next) =>
                      setHardMatchForm((f) => ({
                        ...f,
                        partnerWeightMin: next,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>{copy.weightMax}</span>
                  <ValuePicker
                    id={buildDashboardFieldId("partner-weight-max")}
                    name="partnerWeightMax"
                    value={hardMatchForm.partnerWeightMax}
                    options={partnerWeightValueOptions}
                    placeholder={copy.noLimit}
                    sheetTitle={copy.selectPartnerWeightMax}
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

            <fieldset className="question-block">
              <legend>{copy.schoolExclusion}</legend>
              <p className="app-muted">{copy.schoolExclusionHint}</p>
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
                            {copy.fullyExcluded}
                          </span>
                        ) : isPartiallyExcluded ? (
                          <span className="school-exclusion-status">
                            {copy.excludedPrefix}
                            {activeGenders
                              .map((gender) =>
                                hardMatchGenderLabel(gender, locale),
                              )
                              .join(locale === "zh-CN" ? "、" : ", ")}
                          </span>
                        ) : null}
                      </div>
                      <div
                        className="school-exclusion-genders"
                        role="group"
                        aria-label={copy.excludedGenderAria(school.name)}
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
                              <span>{hardMatchGenderLabel(gender, locale)}</span>
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

        {/* Values questionnaire */}
        {activeTab === "values" && questions.length > 0 && (
          <div className="app-q-group">
            <div className="app-q-group-header">
              <span className="app-q-group-icon app-q-group-icon-values">
                Q
              </span>
              <div>
                <h3>{copy.valuesTitle}</h3>
                <p>{copy.valuesSubtitle(questions.length)}</p>
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
                    <span className="app-q-num">{questionIndex + 1}</span>
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
                        <p className="app-muted">
                          {copy.selectionLimit(selectionLimit)}
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
    </div>
  );
}

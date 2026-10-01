import type {
  MeetupFeedback,
  SubmitMeetupFeedbackPayload,
} from "../../../lib/api";

export type MeetupFeedbackFormState = {
  personalFitScore: number | null;
  interactionQualityScore: number | null;
  safetyBoundaryLevel: string | null;
  positiveTags: string[];
  issueTags: string[];
  note: string;
};

export type MeetupFeedbackOption<T extends string | number = string> = {
  value: T;
  label: string;
};

export const MEETUP_FEEDBACK_NOTE_MAX_LENGTH = 1000;
export const MEETUP_FEEDBACK_TAG_MAX_COUNT = 5;

export const PERSONAL_FIT_OPTIONS = [
  {
    value: 1,
    label: "不适合我",
  },
  {
    value: 2,
    label: "可能不适合",
  },
  {
    value: 3,
    label: "说不清",
  },
  {
    value: 4,
    label: "比较合适",
  },
  {
    value: 5,
    label: "很合适",
  },
] satisfies MeetupFeedbackOption<number>[];

export const INTERACTION_QUALITY_OPTIONS = [
  {
    value: 1,
    label: "很难沟通",
  },
  {
    value: 2,
    label: "有些吃力",
  },
  {
    value: 3,
    label: "普通",
  },
  {
    value: 4,
    label: "比较顺畅",
  },
  {
    value: 5,
    label: "很轻松舒服",
  },
] satisfies MeetupFeedbackOption<number>[];

export const SAFETY_BOUNDARY_OPTIONS = [
  {
    value: "NO_CONCERN",
    label: "没有安全或边界问题",
  },
  {
    value: "MINOR_CONCERN",
    label: "有一点不舒服或边界感不足",
  },
  {
    value: "SERIOUS_CONCERN",
    label: "有明显骚扰、压力、威胁或身份风险",
  },
] satisfies MeetupFeedbackOption[];

export const POSITIVE_TAG_OPTIONS = [
  { value: "EASY_TO_TALK", label: "容易聊天" },
  { value: "GOOD_LISTENER", label: "认真倾听" },
  { value: "RESPECTFUL", label: "尊重边界" },
  { value: "ON_TIME", label: "准时赴约" },
  { value: "CLEAR_PLAN", label: "安排清楚" },
  { value: "COMFORTABLE_PACE", label: "节奏舒服" },
];

export const ISSUE_TAG_OPTIONS = [
  { value: "LOW_EFFORT", label: "投入较少" },
  { value: "INTERRUPTED_OFTEN", label: "经常打断" },
  { value: "HARD_TO_COMMUNICATE", label: "沟通困难" },
  { value: "LATE_OR_NO_SHOW", label: "迟到或爽约" },
  { value: "BOUNDARY_PRESSURE", label: "边界压力" },
  { value: "HARASSMENT_OR_SEXUAL_COMMENTS", label: "骚扰或性化言论" },
  { value: "DISCRIMINATION", label: "歧视表达" },
  { value: "AGGRESSIVE_OR_THREATENING", label: "攻击或威胁" },
  { value: "MONEY_OR_SCAM", label: "金钱或诈骗风险" },
  { value: "IDENTITY_MISMATCH", label: "身份不符" },
  { value: "OTHER", label: "其他" },
];

export function createMeetupFeedbackFormState(
  feedback: MeetupFeedback | null | undefined,
): MeetupFeedbackFormState {
  return {
    personalFitScore: feedback?.personalFitScore ?? null,
    interactionQualityScore: feedback?.interactionQualityScore ?? null,
    safetyBoundaryLevel: feedback?.safetyBoundaryLevel ?? null,
    positiveTags: feedback?.positiveTags ?? [],
    issueTags: feedback?.issueTags ?? [],
    note: feedback?.note ?? "",
  };
}

export function toggleMeetupFeedbackTag(
  currentTags: string[],
  tag: string,
): string[] {
  return currentTags.includes(tag)
    ? currentTags.filter((item) => item !== tag)
    : [...currentTags, tag];
}

function scoreIsValid(score: number | null) {
  return Number.isInteger(score) && score !== null && score >= 1 && score <= 5;
}

export function validateMeetupFeedbackState(
  state: MeetupFeedbackFormState,
): string | null {
  if (!scoreIsValid(state.personalFitScore)) {
    return "请选择见面后的个人契合感。";
  }
  if (!scoreIsValid(state.interactionQualityScore)) {
    return "请选择这次见面的互动质量。";
  }
  if (!state.safetyBoundaryLevel) {
    return "请选择安全与边界感受。";
  }
  if (state.positiveTags.length > MEETUP_FEEDBACK_TAG_MAX_COUNT) {
    return `正向标签最多选择 ${MEETUP_FEEDBACK_TAG_MAX_COUNT} 个。`;
  }
  if (state.issueTags.length > MEETUP_FEEDBACK_TAG_MAX_COUNT) {
    return `问题标签最多选择 ${MEETUP_FEEDBACK_TAG_MAX_COUNT} 个。`;
  }
  if (state.note.trim().length > MEETUP_FEEDBACK_NOTE_MAX_LENGTH) {
    return `补充说明不能超过 ${MEETUP_FEEDBACK_NOTE_MAX_LENGTH} 个字。`;
  }
  return null;
}

export function buildMeetupFeedbackPayload(
  state: MeetupFeedbackFormState,
): SubmitMeetupFeedbackPayload | string {
  const validationError = validateMeetupFeedbackState(state);
  if (validationError) return validationError;

  return {
    personalFitScore: state.personalFitScore!,
    interactionQualityScore: state.interactionQualityScore!,
    safetyBoundaryLevel: state.safetyBoundaryLevel!,
    positiveTags: state.positiveTags,
    issueTags: state.issueTags,
    note: state.note.trim() || null,
  };
}

export function meetupFeedbackOptionLabel(
  options: MeetupFeedbackOption[],
  value: string | null | undefined,
) {
  return options.find((option) => option.value === value)?.label ?? value ?? "";
}

export function meetupFeedbackTagLabels(
  options: Array<{ value: string; label: string }>,
  values: string[],
) {
  return values.map(
    (value) => options.find((option) => option.value === value)?.label ?? value,
  );
}

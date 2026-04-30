import {
  getHardMatchFormSaveErrorMessage,
  type HardMatchFormState,
} from "../../../lib/hard-match";
import type { SupportedLocale } from "@lilink/shared";
import type { Question } from "./types";

export function keepCurrentQuestionAnswers(
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

export function softQuestionAnswerIsComplete(question: Question, raw: unknown) {
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
        typeof item === "string" &&
        softQuestionSingleValueIsValid(item, options),
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

export function getQuestionnaireIncompleteMessage(
  questions: Question[],
  answers: Record<string, unknown>,
  hardMatchForm: HardMatchFormState,
  displayNameForNickname: string,
  locale: SupportedLocale = "zh-CN",
) {
  const trimmedNickname = displayNameForNickname.trim();
  if (trimmedNickname.length < 2) {
    return locale === "zh-CN"
      ? "昵称至少填写 2 个字。"
      : "Display name must contain at least 2 characters.";
  }

  const hardMessage = getHardMatchFormSaveErrorMessage(hardMatchForm, locale);
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
    return locale === "zh-CN"
      ? `价值观问卷「${incompleteSoft[0].prompt}」尚未填写。`
      : `Question "${incompleteSoft[0].prompt}" is not answered yet.`;
  }

  return locale === "zh-CN"
    ? `价值观问卷还有 ${incompleteSoft.length} 道必答题未完成。`
    : `${incompleteSoft.length} required questionnaire questions are still incomplete.`;
}

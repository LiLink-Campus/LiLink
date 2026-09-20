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
  const options = question.options ?? [];

  if (question.type === "MULTI_SELECT") {
    if (!Array.isArray(raw) || raw.length === 0) {
      return false;
    }

    const limit = question.selectionLimit;
    if (limit != null && new Set(raw).size !== limit) {
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

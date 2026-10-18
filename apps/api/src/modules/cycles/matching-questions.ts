import { QuestionType } from '../../common/prisma/client';
import {
  normalizeQuestionAnswer,
  normalizeQuestionOptions,
  resolveQuestionOptionValue,
} from '../questionnaire/questionnaire-config';
import type { MatchQuestion, PreparedQuestion } from './matching-types';

function isPreparedQuestion(
  question: MatchQuestion,
): question is PreparedQuestion {
  return 'normalizedOptions' in question;
}

function prepareQuestion(question: MatchQuestion): PreparedQuestion {
  if (isPreparedQuestion(question)) {
    return question;
  }

  return {
    key: question.key,
    prompt: question.prompt,
    description: question.description ?? null,
    type: question.type,
    weight: question.weight,
    selectionLimit: question.selectionLimit ?? null,
    normalizedOptions: normalizeQuestionOptions(question.options),
  };
}

export function prepareQuestions(
  questions: MatchQuestion[],
): PreparedQuestion[] {
  return questions.map((question) => prepareQuestion(question));
}

function readNormalizedQuestionString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

export function normalizePreparedQuestionAnswer(
  question: PreparedQuestion,
  rawAnswer: unknown,
  options: { invalidAsNull?: boolean } = {},
) {
  const fallbackQuestion = {
    ...question,
    options: question.normalizedOptions,
  };

  if (
    question.type === QuestionType.SINGLE_SELECT ||
    question.type === QuestionType.SCALE
  ) {
    if (typeof rawAnswer !== 'string') {
      return options.invalidAsNull
        ? null
        : normalizeQuestionAnswer(fallbackQuestion, rawAnswer);
    }

    const normalizedAnswer = readNormalizedQuestionString(rawAnswer);
    if (!normalizedAnswer) {
      return null;
    }

    if (question.normalizedOptions.length === 0) {
      return normalizedAnswer;
    }

    const resolvedValue = resolveQuestionOptionValue(
      normalizedAnswer,
      question.normalizedOptions,
    );

    if (!resolvedValue) {
      return options.invalidAsNull
        ? null
        : normalizeQuestionAnswer(fallbackQuestion, rawAnswer);
    }

    return resolvedValue;
  }

  if (question.type !== QuestionType.MULTI_SELECT) {
    return options.invalidAsNull
      ? null
      : normalizeQuestionAnswer(fallbackQuestion, rawAnswer);
  }

  if (!Array.isArray(rawAnswer)) {
    return options.invalidAsNull
      ? null
      : normalizeQuestionAnswer(fallbackQuestion, rawAnswer);
  }

  const normalizedValues = [
    ...new Set(
      rawAnswer
        .map((value) => {
          if (typeof value !== 'string') {
            return null;
          }

          if (question.normalizedOptions.length === 0) {
            return readNormalizedQuestionString(value);
          }

          return resolveQuestionOptionValue(value, question.normalizedOptions);
        })
        .filter((value): value is string => Boolean(value)),
    ),
  ];

  if (normalizedValues.length === 0) {
    return null;
  }

  if (
    question.selectionLimit != null &&
    normalizedValues.length !== question.selectionLimit
  ) {
    if (normalizedValues.length < question.selectionLimit) return null;
    return options.invalidAsNull
      ? null
      : normalizeQuestionAnswer(fallbackQuestion, rawAnswer);
  }

  return normalizedValues;
}

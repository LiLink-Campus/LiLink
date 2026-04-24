import { hardMatchFormFromAnswers } from "../../../lib/hard-match";
import {
  keepCurrentQuestionAnswers,
  softQuestionAnswerIsComplete,
} from "./questionnaire";
import type {
  Question,
  QuestionnairePayload,
  SavedQuestionnairePayload,
} from "./types";

/**
 * Bucket weights for the home hub's "questionnaire progress" ring.
 * The relative split lets the percentage move predictably as the user
 * fills in different sections (nickname, hard match, value questions).
 */
const NICKNAME_WEIGHT = 1;
const HARD_MATCH_WEIGHT = 5;
const SOFT_QUESTION_WEIGHT = 1;

const HARD_MATCH_REQUIRED_FIELDS = [
  "birthYear",
  "birthMonth",
  "birthDay",
  "gender",
  "looks",
  "heightCm",
  "partnerAgeMin",
  "partnerAgeMax",
  "partnerHeightMin",
  "partnerHeightMax",
] as const;

const HARD_MATCH_REQUIRED_LIST_FIELDS = [
  "partnerGenders",
  "partnerLooks",
] as const;

function hardMatchCompletion(
  saved: SavedQuestionnairePayload,
  schools: QuestionnairePayload["schools"],
): number {
  const hardMatchForm = hardMatchFormFromAnswers(
    saved?.draft?.softAnswers ?? saved?.answers ?? undefined,
    schools,
  );

  const draftForm = saved?.draft?.hardMatchForm ?? hardMatchForm;
  const totalChecks =
    HARD_MATCH_REQUIRED_FIELDS.length + HARD_MATCH_REQUIRED_LIST_FIELDS.length;

  let satisfied = 0;
  for (const field of HARD_MATCH_REQUIRED_FIELDS) {
    if ((draftForm[field] ?? "").toString().trim().length > 0) {
      satisfied += 1;
    }
  }

  for (const field of HARD_MATCH_REQUIRED_LIST_FIELDS) {
    if ((draftForm[field] ?? []).length > 0) {
      satisfied += 1;
    }
  }

  return totalChecks === 0 ? 0 : satisfied / totalChecks;
}

function softQuestionCompletion(
  questions: Question[],
  saved: SavedQuestionnairePayload,
): number {
  const requiredQuestions = questions.filter((q) => q.required !== false);
  if (requiredQuestions.length === 0) {
    return 1;
  }

  const answers =
    saved?.draft?.softAnswers ??
    keepCurrentQuestionAnswers(questions, saved?.answers);

  const completed = requiredQuestions.filter((question) =>
    softQuestionAnswerIsComplete(question, answers[question.key]),
  ).length;

  return completed / requiredQuestions.length;
}

function nicknameCompletion(
  saved: SavedQuestionnairePayload,
  fallbackDisplayName: string | null,
): number {
  const candidate =
    saved?.draft?.displayName?.trim() ?? fallbackDisplayName?.trim() ?? "";
  return candidate.length >= 2 ? 1 : 0;
}

export function computeQuestionnaireProgress(args: {
  questions: Question[];
  schools: QuestionnairePayload["schools"];
  savedQuestionnaire: SavedQuestionnairePayload;
  fallbackDisplayName: string | null;
}): { percent: number; submitted: boolean } {
  const submitted = Boolean(args.savedQuestionnaire?.submittedAt);

  const nicknameRatio = nicknameCompletion(
    args.savedQuestionnaire,
    args.fallbackDisplayName,
  );
  const hardRatio = hardMatchCompletion(
    args.savedQuestionnaire,
    args.schools,
  );
  const softRatio = softQuestionCompletion(
    args.questions,
    args.savedQuestionnaire,
  );

  const totalWeight =
    NICKNAME_WEIGHT +
    HARD_MATCH_WEIGHT +
    SOFT_QUESTION_WEIGHT * args.questions.length;

  const weighted =
    NICKNAME_WEIGHT * nicknameRatio +
    HARD_MATCH_WEIGHT * hardRatio +
    SOFT_QUESTION_WEIGHT * args.questions.length * softRatio;

  const ratio = totalWeight === 0 ? 0 : weighted / totalWeight;
  const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));

  return { percent, submitted };
}

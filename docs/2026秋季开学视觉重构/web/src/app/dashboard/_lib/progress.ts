import {
  readQuestionnaireOneLiner,
} from "@lilink/shared";
import {
  getHardMatchFormSaveErrorMessage,
  hardMatchAttentionKeys,
  hardMatchFormFromAnswers,
} from "../../../lib/hard-match";
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
  "nationality",
  "looks",
  "heightCm",
  "partnerAgeMin",
  "partnerAgeMax",
  "partnerHeightMin",
  "partnerHeightMax",
] as const;

const HARD_MATCH_REQUIRED_LIST_FIELDS = [
  "languages",
  "partnerGenders",
  "partnerLooks",
] as const;

function hardMatchCompletion(
  saved: SavedQuestionnairePayload,
  schools: QuestionnairePayload["schools"],
): { ratio: number; isSavable: boolean } {
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

  const ratio = totalChecks === 0 ? 0 : satisfied / totalChecks;
  const isSavable =
    ratio >= 1 && getHardMatchFormSaveErrorMessage(draftForm) === null;

  return { ratio, isSavable };
}

function oneLinerIntroIsComplete(saved: SavedQuestionnairePayload): boolean {
  return readQuestionnaireOneLiner(saved?.answers ?? undefined) !== null;
}

function currentSoftAnswers(
  questions: Question[],
  saved: SavedQuestionnairePayload,
) {
  return (
    saved?.draft?.softAnswers ??
    keepCurrentQuestionAnswers(questions, saved?.answers)
  );
}

function softQuestionCompletion(
  questions: Question[],
  answers: Record<string, unknown>,
): number {
  const requiredQuestions = questions.filter((q) => q.required !== false);
  if (requiredQuestions.length === 0) {
    return 1;
  }

  const completed = requiredQuestions.filter((question) =>
    softQuestionAnswerIsComplete(question, answers[question.key]),
  ).length;

  return completed / requiredQuestions.length;
}

function pendingUpdateReviewWeight(
  questions: Question[],
  saved: SavedQuestionnairePayload,
) {
  const attention = saved?.attention;
  if (!attention || attention.pendingUpdatedKeys.length === 0) {
    return 0;
  }

  const currentQuestionKeys = new Set(questions.map((question) => question.key));
  const hardMatchKeySet = new Set<string>(hardMatchAttentionKeys());
  const attentionItemsByKey = new Map(
    attention.items.map((item) => [item.key, item]),
  );

  const softQuestionReviewWeight =
    attention.pendingUpdatedKeys.filter((key) => {
      const item = attentionItemsByKey.get(key);
      return currentQuestionKeys.has(key) && item && !item.missingRequired;
    }).length * SOFT_QUESTION_WEIGHT;

  const hardMatchReviewWeight =
    hardMatchKeySet.size === 0
      ? 0
      : attention.pendingUpdatedKeys.filter((key) => {
          const item = attentionItemsByKey.get(key);
          return hardMatchKeySet.has(key) && item && !item.missingRequired;
        }).length *
        (HARD_MATCH_WEIGHT / hardMatchKeySet.size);

  return softQuestionReviewWeight + hardMatchReviewWeight;
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
}): {
  percent: number;
  confirmedPercent: number;
  unconfirmedPercent: number;
  unconfirmedCount: number;
  submitted: boolean;
  profileReady: boolean;
  missingOneLinerIntro: boolean;
  eligibleToOptIn: boolean;
  hasIncompleteDraft: boolean;
} {
  const submitted = Boolean(args.savedQuestionnaire?.submittedAt);

  const nicknameRatio = nicknameCompletion(
    args.savedQuestionnaire,
    args.fallbackDisplayName,
  );
  const hardCompletion = hardMatchCompletion(
    args.savedQuestionnaire,
    args.schools,
  );
  const softAnswers = currentSoftAnswers(args.questions, args.savedQuestionnaire);
  const softRatio = softQuestionCompletion(args.questions, softAnswers);

  const totalWeight =
    NICKNAME_WEIGHT +
    HARD_MATCH_WEIGHT +
    SOFT_QUESTION_WEIGHT * args.questions.length;

  const weighted =
    NICKNAME_WEIGHT * nicknameRatio +
    HARD_MATCH_WEIGHT * hardCompletion.ratio +
    SOFT_QUESTION_WEIGHT * args.questions.length * softRatio;

  const reviewWeight = pendingUpdateReviewWeight(
    args.questions,
    args.savedQuestionnaire,
  );
  const reviewAdjustedWeighted = Math.max(0, weighted - reviewWeight);
  const ratio =
    totalWeight === 0 ? 0 : reviewAdjustedWeighted / totalWeight;
  const percent = Math.max(0, Math.min(100, Math.round(ratio * 100)));

  // Honest split: confirmed = current (review-adjusted) percent; unconfirmed =
  // the weight currently subtracted because it still needs the user's review
  // (pending soft-question updates today; hard-match/weight via the backend
  // plan). unconfirmedCount mirrors the attention payload.
  const confirmedPercent = percent;
  const unconfirmedRatio =
    totalWeight === 0 ? 0 : Math.min(reviewWeight, weighted) / totalWeight;
  const unconfirmedPercent = Math.max(
    0,
    Math.min(100 - confirmedPercent, Math.round(unconfirmedRatio * 100)),
  );
  const attention = args.savedQuestionnaire?.attention ?? null;
  const unconfirmedCount = attention
    ? new Set([
        ...attention.pendingUpdatedKeys,
        ...attention.missingRequiredKeys,
      ]).size
    : 0;

  // Mirrors AccountService.assertQuestionnaireReadyForOptIn: opting in
  // requires a previous successful submission AND a current draft (if any)
  // that still satisfies every required field. Comparing the raw ratios
  // (rather than `percent === 100`) avoids misreporting eligibility because
  // of rounding to integer percent.
  const profileReady =
    nicknameRatio >= 1 && hardCompletion.isSavable && softRatio >= 1;
  const oneLinerIntroComplete = oneLinerIntroIsComplete(args.savedQuestionnaire);
  const eligibleToOptIn = submitted && profileReady && oneLinerIntroComplete;
  const missingOneLinerIntro =
    submitted && profileReady && !oneLinerIntroComplete;
  const hasIncompleteDraft =
    submitted && args.savedQuestionnaire?.draft != null && !profileReady;

  return {
    percent,
    confirmedPercent,
    unconfirmedPercent,
    unconfirmedCount,
    submitted,
    profileReady,
    missingOneLinerIntro,
    eligibleToOptIn,
    hasIncompleteDraft,
  };
}

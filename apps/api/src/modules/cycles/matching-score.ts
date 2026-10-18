import { BadRequestException } from '@nestjs/common';
import { QuestionType } from '../../common/prisma/client';
import {
  areWeeklyIntentsCompatible,
  areHardMatchAnswersCompatible,
  calculateAgeOnDate,
  HARD_MATCH_LOOKS,
  type HardMatchAnswers,
} from '@lilink/shared';
import {
  prepareQuestions,
  normalizePreparedQuestionAnswer,
} from './matching-questions';
import type {
  EligibleParticipant,
  PreparedQuestion,
  MatchQuestion,
  ComparableQuestion,
  PairQuestionSet,
  MatchScoreBounds,
} from './matching-types';

const BASE_MATCH_SCORE = 48;
const SINGLE_SELECT_MATCH_BONUS = 6;
const MULTI_SELECT_OVERLAP_BONUS = 3;
const LOOKS_PREFERENCE_SOFT_BONUS = MULTI_SELECT_OVERLAP_BONUS;
// Age is a soft preference (see hard-match.ts comment on
// areHardMatchAnswersCompatible). Each side contributes 0..1 to the fit
// score: 1 when their age sits inside the partner's preferred window, then
// linearly decays toward 0 outside the window. Hitting both sides perfectly
// adds AGE_PREFERENCE_SOFT_BONUS to the raw match score; falling fully
// outside on both sides adds nothing without dropping the pair.
const AGE_PREFERENCE_SOFT_BONUS = 6;
const AGE_PREFERENCE_DECAY_PER_YEAR = 0.25;
const NORMALIZED_SCORE_MIN = 70;
const NORMALIZED_SCORE_MAX = 100;

export class MatchingScore {
  private questionSetCache?: WeakMap<
    PreparedQuestion[],
    WeakMap<PreparedQuestion[], PairQuestionSet>
  >;
  private answerCache?: WeakMap<
    EligibleParticipant,
    Map<PreparedQuestion, ReturnType<typeof normalizePreparedQuestionAnswer>>
  >;

  reset() {
    this.questionSetCache = new WeakMap();
    this.answerCache = new WeakMap();
  }
  clear() {
    this.questionSetCache = undefined;
    this.answerCache = undefined;
  }
  private resolveParticipantQuestions(
    participant: EligibleParticipant,
    fallbackQuestions: PreparedQuestion[],
    questionnairesByVersionId: Map<string, PreparedQuestion[]> = new Map(),
  ) {
    if (!participant.questionnaireVersionId) {
      return fallbackQuestions;
    }

    return (
      questionnairesByVersionId.get(participant.questionnaireVersionId) ??
      fallbackQuestions
    );
  }

  buildPairQuestionSet(
    left: EligibleParticipant,
    right: EligibleParticipant,
    fallbackQuestions: PreparedQuestion[],
    questionnairesByVersionId: Map<string, PreparedQuestion[]> = new Map(),
  ): PairQuestionSet {
    const leftQuestions = this.resolveParticipantQuestions(
      left,
      fallbackQuestions,
      questionnairesByVersionId,
    );
    const rightQuestions = this.resolveParticipantQuestions(
      right,
      fallbackQuestions,
      questionnairesByVersionId,
    );
    const cached = this.questionSetCache
      ?.get(leftQuestions)
      ?.get(rightQuestions);
    if (cached) return cached;
    const rightQuestionsByKey = new Map(
      rightQuestions.map((question) => [question.key, question]),
    );

    const comparableQuestions = leftQuestions
      .map((leftQuestion, order): ComparableQuestion | null => {
        const rightQuestion = rightQuestionsByKey.get(leftQuestion.key);

        if (!rightQuestion || leftQuestion.type !== rightQuestion.type) {
          return null;
        }

        return {
          key: leftQuestion.key,
          order,
          type: leftQuestion.type,
          weight: (leftQuestion.weight + rightQuestion.weight) / 2,
          leftQuestion,
          rightQuestion,
        };
      })
      .filter((question): question is ComparableQuestion => question !== null);

    const result = {
      leftQuestions,
      rightQuestions,
      comparableQuestions,
    };
    if (this.questionSetCache) {
      let rightSets = this.questionSetCache.get(leftQuestions);
      if (!rightSets) {
        rightSets = new WeakMap();
        this.questionSetCache.set(leftQuestions, rightSets);
      }
      rightSets.set(rightQuestions, result);
    }
    return result;
  }

  private readParticipantAnswer(
    participant: EligibleParticipant,
    question: PreparedQuestion,
  ) {
    const answers = this.answerCache?.get(participant);
    if (answers?.has(question)) return answers.get(question)!;
    const answer = normalizePreparedQuestionAnswer(
      question,
      participant.answers[question.key],
      { invalidAsNull: true },
    );
    if (this.answerCache) {
      const target =
        answers ??
        new Map<
          PreparedQuestion,
          ReturnType<typeof normalizePreparedQuestionAnswer>
        >();
      target.set(question, answer);
      this.answerCache.set(participant, target);
    }
    return answer;
  }

  private calculateLooksPreferenceSimilarity(
    left: HardMatchAnswers,
    right: HardMatchAnswers,
  ) {
    const leftAcceptsRight = this.looksPreferenceIncludes(
      left.partnerLooks,
      right.looks,
    );
    const rightAcceptsLeft = this.looksPreferenceIncludes(
      right.partnerLooks,
      left.looks,
    );

    return (leftAcceptsRight + rightAcceptsLeft) / 2;
  }

  private looksPreferenceIncludes(
    selectedLooks: readonly string[],
    candidateLooks: string,
  ) {
    if (selectedLooks.length === 0) {
      return 0;
    }

    if (selectedLooks.length === HARD_MATCH_LOOKS.length) {
      return 1;
    }

    return selectedLooks.includes(candidateLooks) ? 1 : 0;
  }

  private calculateAgePreferenceSimilarity(
    left: HardMatchAnswers,
    right: HardMatchAnswers,
    revealAt: Date,
  ) {
    const leftAge = calculateAgeOnDate(left.birthDate, revealAt);
    const rightAge = calculateAgeOnDate(right.birthDate, revealAt);
    const leftFit = this.agePreferenceFit(
      rightAge,
      left.partnerAgeMin,
      left.partnerAgeMax,
    );
    const rightFit = this.agePreferenceFit(
      leftAge,
      right.partnerAgeMin,
      right.partnerAgeMax,
    );

    return (leftFit + rightFit) / 2;
  }

  private agePreferenceFit(
    candidateAge: number,
    partnerAgeMin: number,
    partnerAgeMax: number,
  ) {
    if (candidateAge >= partnerAgeMin && candidateAge <= partnerAgeMax) {
      return 1;
    }

    const yearsOutside =
      candidateAge < partnerAgeMin
        ? partnerAgeMin - candidateAge
        : candidateAge - partnerAgeMax;
    return Math.max(0, 1 - AGE_PREFERENCE_DECAY_PER_YEAR * yearsOutside);
  }

  private calculateScaleAnswerSimilarity(
    leftQuestion: PreparedQuestion,
    leftAnswer: string,
    rightQuestion: PreparedQuestion,
    rightAnswer: string,
  ) {
    if (leftAnswer === rightAnswer) {
      return 1;
    }

    const leftPosition = this.getScaleAnswerPosition(leftQuestion, leftAnswer);
    const rightPosition = this.getScaleAnswerPosition(
      rightQuestion,
      rightAnswer,
    );

    if (leftPosition == null || rightPosition == null) {
      return 0;
    }

    return Math.max(0, 1 - Math.abs(leftPosition - rightPosition));
  }

  private getScaleAnswerPosition(question: PreparedQuestion, answer: string) {
    const optionIndex = question.normalizedOptions.findIndex(
      (option) => option.value === answer,
    );

    if (optionIndex < 0 || question.normalizedOptions.length < 2) {
      return null;
    }

    return optionIndex / (question.normalizedOptions.length - 1);
  }

  calculatePairRawScore(
    left: EligibleParticipant,
    right: EligibleParticipant,
    questions: MatchQuestion[],
    revealAt: Date,
    scoreBounds?: MatchScoreBounds,
    pairQuestionSet?: PairQuestionSet,
  ) {
    const resolvedQuestionSet =
      pairQuestionSet ??
      this.buildPairQuestionSet(left, right, prepareQuestions(questions));
    const resolvedScoreBounds =
      scoreBounds ??
      this.calculateMatchScoreBounds(resolvedQuestionSet.comparableQuestions);

    // Weekly-intent compatibility (FRIEND/DATE/BOTH) is a hard cycle-level
    // constraint, evaluated alongside the long-lived hard-match answers.
    if (!areWeeklyIntentsCompatible(left.intent, right.intent)) {
      return null;
    }

    if (
      !areHardMatchAnswersCompatible(
        left.hardMatchAnswers,
        right.hardMatchAnswers,
      )
    ) {
      return null;
    }

    let rawScore = BASE_MATCH_SCORE;

    rawScore +=
      this.calculateLooksPreferenceSimilarity(
        left.hardMatchAnswers,
        right.hardMatchAnswers,
      ) * LOOKS_PREFERENCE_SOFT_BONUS;

    rawScore +=
      this.calculateAgePreferenceSimilarity(
        left.hardMatchAnswers,
        right.hardMatchAnswers,
        revealAt,
      ) * AGE_PREFERENCE_SOFT_BONUS;

    for (const question of resolvedQuestionSet.comparableQuestions) {
      const leftAnswer = this.readParticipantAnswer(
        left,
        question.leftQuestion,
      );
      const rightAnswer = this.readParticipantAnswer(
        right,
        question.rightQuestion,
      );
      const weight = question.weight;

      if (leftAnswer == null || rightAnswer == null) {
        continue;
      }

      if (
        question.type === QuestionType.SINGLE_SELECT &&
        leftAnswer === rightAnswer
      ) {
        rawScore += weight * SINGLE_SELECT_MATCH_BONUS;
      }

      if (
        question.type === QuestionType.SCALE &&
        typeof leftAnswer === 'string' &&
        typeof rightAnswer === 'string'
      ) {
        const similarity = this.calculateScaleAnswerSimilarity(
          question.leftQuestion,
          leftAnswer,
          question.rightQuestion,
          rightAnswer,
        );

        if (similarity > 0) {
          rawScore += weight * SINGLE_SELECT_MATCH_BONUS * similarity;
        }
      }

      if (question.type === QuestionType.MULTI_SELECT) {
        const leftOptions = Array.isArray(leftAnswer) ? leftAnswer : [];
        const rightOptions = Array.isArray(rightAnswer) ? rightAnswer : [];
        const overlap = leftOptions.filter((value) =>
          rightOptions.includes(value),
        );
        const union = [...new Set([...leftOptions, ...rightOptions])];

        if (overlap.length > 0) {
          rawScore +=
            (overlap.length / union.length) *
            weight *
            MULTI_SELECT_OVERLAP_BONUS;
        }
      }
    }

    return {
      rawScore,
      scoreBounds: resolvedScoreBounds,
    };
  }

  calculateMaxMatchScoreBounds(
    questionSets: Array<Array<{ type: QuestionType; weight: number }>>,
  ): MatchScoreBounds {
    return questionSets
      .map((questions) => this.calculateMatchScoreBounds(questions))
      .reduce(
        (bounds, currentBounds) => ({
          min: Math.min(bounds.min, currentBounds.min),
          max: Math.max(bounds.max, currentBounds.max),
        }),
        {
          min: BASE_MATCH_SCORE,
          max:
            BASE_MATCH_SCORE +
            LOOKS_PREFERENCE_SOFT_BONUS +
            AGE_PREFERENCE_SOFT_BONUS,
        },
      );
  }

  private calculateMatchScoreBounds(
    questions: Array<{ type: QuestionType; weight: number }>,
  ): MatchScoreBounds {
    let max =
      BASE_MATCH_SCORE +
      LOOKS_PREFERENCE_SOFT_BONUS +
      AGE_PREFERENCE_SOFT_BONUS;

    for (const question of questions) {
      if (
        question.type === QuestionType.SINGLE_SELECT ||
        question.type === QuestionType.SCALE
      ) {
        max += question.weight * SINGLE_SELECT_MATCH_BONUS;
        continue;
      }

      if (question.type === QuestionType.MULTI_SELECT) {
        max += question.weight * MULTI_SELECT_OVERLAP_BONUS;
      }
    }

    return {
      min: BASE_MATCH_SCORE,
      max,
    };
  }

  normalizeMatchScore(rawScore: number, scoreBounds: MatchScoreBounds) {
    if (scoreBounds.max < scoreBounds.min) {
      throw new BadRequestException(
        'Match score bounds are invalid for the current questionnaire.',
      );
    }

    if (scoreBounds.max === scoreBounds.min) {
      return NORMALIZED_SCORE_MAX;
    }

    const ratio =
      (rawScore - scoreBounds.min) / (scoreBounds.max - scoreBounds.min);
    const normalizedScore =
      NORMALIZED_SCORE_MIN +
      ratio * (NORMALIZED_SCORE_MAX - NORMALIZED_SCORE_MIN);

    return Math.round(normalizedScore * 10) / 10;
  }
}

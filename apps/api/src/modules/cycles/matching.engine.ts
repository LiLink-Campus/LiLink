import { BadRequestException } from '@nestjs/common';
import blossom from '../../vendor/edmonds-blossom/index.cjs';
import { Prisma, QuestionType } from '../../common/prisma/client';
import {
  HARD_MATCH_LOOKS,
  HardMatchAnswers,
  areHardMatchAnswersCompatible,
} from '../questionnaire/hard-match';
import {
  areWeeklyIntentsCompatible,
  calculateAgeOnDate,
  type WeeklyIntent,
} from '@lilink/shared';
import {
  type QuestionOption,
  normalizeQuestionAnswer,
  normalizeQuestionOptions,
  resolveQuestionOptionValue,
} from '../questionnaire/questionnaire-config';

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
const PRIORITY_UNMATCHED_STREAK_THRESHOLD = 3;
const PRE_PRIORITY_UNMATCHED_STREAK_BONUS = 2;
// First-cycle boost: a small, lowest-tier nudge so users in their very first
// opt-in cycle are slightly more likely to be matched, improving the first
// experience and retention. Lives at the same tier as rawScore — it never
// overrides the priority, streak, or match-count-maximization tiers. Applied
// linearly per first-cycle user on a pair (one new user +N, both new +2N).
const NEW_OPT_IN_FIRST_CYCLE_BONUS = 6;

export type EligibleParticipant = {
  id: string;
  displayName: string | null;
  questionnaireVersionId: string | null;
  hardMatchAnswers: HardMatchAnswers;
  answers: Record<string, unknown>;
  intent: WeeklyIntent;
};

export type CandidatePair = {
  left: EligibleParticipant;
  right: EligibleParticipant;
  rawScore: number;
  score: number;
  matchingWeight: number;
};

type RetentionWeightTiers = {
  priorityUser: number;
  priorityStreak: number;
  matchedUser: number;
};

export type QuestionnaireQuestion = {
  key: string;
  prompt: string;
  description?: string | null;
  type: QuestionType;
  weight: number;
  selectionLimit?: number | null;
  options: Prisma.JsonValue | null;
};

export type PreparedQuestion = Omit<QuestionnaireQuestion, 'options'> & {
  normalizedOptions: QuestionOption[];
};

type MatchQuestion = QuestionnaireQuestion | PreparedQuestion;

type ComparableQuestion = {
  key: string;
  order: number;
  type: QuestionType;
  weight: number;
  leftQuestion: PreparedQuestion;
  rightQuestion: PreparedQuestion;
};

type PairQuestionSet = {
  leftQuestions: PreparedQuestion[];
  rightQuestions: PreparedQuestion[];
  comparableQuestions: ComparableQuestion[];
};

type MatchScoreBounds = {
  min: number;
  max: number;
};

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

function normalizePreparedQuestionAnswer(
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

export type MatchingInput = {
  participants: EligibleParticipant[];
  questions: QuestionnaireQuestion[];
  revealAt: Date;
  questionnairesByVersionId: Map<string, PreparedQuestion[]>;
  blockedPairKeys: Set<string>;
  historicalPairKeys: Set<string>;
  unmatchedStreaks: Map<string, number>;
  firstCycleParticipantIds: Set<string>;
};

export type MatchingResult = {
  candidateCount: number;
  candidates: CandidatePair[];
  selectedPairs: CandidatePair[];
};

export class MatchingEngine {
  private questionSetCache?: WeakMap<
    PreparedQuestion[],
    WeakMap<PreparedQuestion[], PairQuestionSet>
  >;
  private answerCache?: WeakMap<
    EligibleParticipant,
    Map<PreparedQuestion, ReturnType<typeof normalizePreparedQuestionAnswer>>
  >;

  constructor(
    private readonly reportStage?: (stage: {
      phase: string;
      participants: number;
      candidates: number;
      elapsedMs: number;
    }) => void,
  ) {}

  calculate(input: MatchingInput): MatchingResult {
    this.questionSetCache = new WeakMap();
    this.answerCache = new WeakMap();
    const started = performance.now();
    const {
      participants,
      revealAt,
      questionnairesByVersionId,
      blockedPairKeys,
      historicalPairKeys,
      unmatchedStreaks,
      firstCycleParticipantIds,
    } = input;
    const preparedQuestions = prepareQuestions(input.questions);
    const scoreBounds = this.calculateMaxMatchScoreBounds([
      preparedQuestions,
      ...questionnairesByVersionId.values(),
    ]);
    const retentionWeightTiers = this.buildRetentionWeightTiers(
      participants.length,
      scoreBounds,
      unmatchedStreaks,
    );
    const candidateByPairKey = new Map<string, CandidatePair>();
    const participantCount = participants.length;

    for (let leftIndex = 0; leftIndex < participants.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < participantCount;
        rightIndex += 1
      ) {
        const left = participants[leftIndex];
        const right = participants[rightIndex];
        const candidateResult = this.buildCandidatePair({
          left,
          right,
          fallbackQuestions: preparedQuestions,
          questionnairesByVersionId,
          revealAt,
          scoreBounds,
          blockedPairKeys,
          historicalPairKeys,
          unmatchedStreaks,
          firstCycleParticipantIds,
          retentionWeightTiers,
        });
        if (
          !candidateResult ||
          candidateByPairKey.has(candidateResult.pairKey)
        ) {
          continue;
        }

        candidateByPairKey.set(
          candidateResult.pairKey,
          candidateResult.candidate,
        );
      }
    }

    const candidates = [...candidateByPairKey.values()].sort((first, second) =>
      this.compareCandidatePairs(first, second),
    );
    // Release the temporary string index before the solver allocates its graph.
    candidateByPairKey.clear();
    const solverStarted = performance.now();
    this.reportStage?.({
      phase: 'candidates',
      participants: participants.length,
      candidates: candidates.length,
      elapsedMs: Math.round(solverStarted - started),
    });
    const selectedPairs = this.selectRetentionPriorityPairs(
      participants,
      candidates,
    );
    this.reportStage?.({
      phase: 'solver',
      participants: participants.length,
      candidates: candidates.length,
      elapsedMs: Math.round(performance.now() - solverStarted),
    });
    this.questionSetCache = undefined;
    this.answerCache = undefined;

    return {
      candidateCount: candidates.length,
      candidates: candidates.slice(0, 20),
      selectedPairs,
    };
  }

  private createPairKey(firstUserId: string, secondUserId: string) {
    return [firstUserId, secondUserId].sort().join('::');
  }

  private buildCandidatePair(input: {
    left: EligibleParticipant;
    right: EligibleParticipant;
    fallbackQuestions: PreparedQuestion[];
    questionnairesByVersionId: Map<string, PreparedQuestion[]>;
    revealAt: Date;
    scoreBounds: MatchScoreBounds;
    blockedPairKeys: Set<string>;
    historicalPairKeys: Set<string>;
    unmatchedStreaks: Map<string, number>;
    firstCycleParticipantIds: Set<string>;
    retentionWeightTiers: RetentionWeightTiers;
  }): { pairKey: string; candidate: CandidatePair } | null {
    const pairKey = this.createPairKey(input.left.id, input.right.id);

    if (
      input.blockedPairKeys.has(pairKey) ||
      input.historicalPairKeys.has(pairKey)
    ) {
      return null;
    }

    const pairQuestionSet = this.buildPairQuestionSet(
      input.left,
      input.right,
      input.fallbackQuestions,
      input.questionnairesByVersionId,
    );
    const scored = this.calculatePairRawScore(
      input.left,
      input.right,
      input.fallbackQuestions,
      input.revealAt,
      input.scoreBounds,
      pairQuestionSet,
    );
    if (!scored) {
      return null;
    }
    const score = this.normalizeMatchScore(scored.rawScore, scored.scoreBounds);

    const leftUnmatchedStreak = input.unmatchedStreaks.get(input.left.id) ?? 0;
    const rightUnmatchedStreak =
      input.unmatchedStreaks.get(input.right.id) ?? 0;

    return {
      pairKey,
      candidate: {
        left: input.left,
        right: input.right,
        rawScore: scored.rawScore,
        score,
        matchingWeight: this.calculateRetentionMatchingWeight({
          rawScore: scored.rawScore,
          leftUnmatchedStreak,
          rightUnmatchedStreak,
          leftIsFirstCycle: input.firstCycleParticipantIds.has(input.left.id),
          rightIsFirstCycle: input.firstCycleParticipantIds.has(input.right.id),
          tiers: input.retentionWeightTiers,
        }),
      },
    };
  }

  private compareCandidatePairs(first: CandidatePair, second: CandidatePair) {
    if (second.score !== first.score) {
      return second.score - first.score;
    }

    if (second.rawScore !== first.rawScore) {
      return second.rawScore - first.rawScore;
    }

    return this.createPairKey(first.left.id, first.right.id).localeCompare(
      this.createPairKey(second.left.id, second.right.id),
    );
  }

  private buildRetentionWeightTiers(
    participantCount: number,
    scoreBounds: MatchScoreBounds,
    unmatchedStreaks: Map<string, number>,
  ): RetentionWeightTiers {
    const maxPairCount = Math.max(1, Math.floor(participantCount / 2));
    const maxPrePriorityBonusTotal =
      maxPairCount *
      2 *
      (PRIORITY_UNMATCHED_STREAK_THRESHOLD - 1) *
      PRE_PRIORITY_UNMATCHED_STREAK_BONUS;
    // First-cycle boosts live in the compatibility tier, so they must be
    // bounded here too — otherwise their accumulation could overflow into the
    // matchedUser tier and make the algorithm drop a pair to chase boosts.
    const maxNewUserBonusTotal =
      maxPairCount * 2 * NEW_OPT_IN_FIRST_CYCLE_BONUS;
    const maxCompatibilityTotal =
      maxPairCount *
        Math.max(1, Math.ceil(scoreBounds.max), NORMALIZED_SCORE_MAX) +
      maxPrePriorityBonusTotal +
      maxNewUserBonusTotal;
    const matchedUser = maxCompatibilityTotal + 1;
    const maxMatchedUserTotal = maxPairCount * 2 * matchedUser;
    const priorityStreak = maxMatchedUserTotal + maxCompatibilityTotal + 1;
    const maxPriorityStreak = Math.max(
      0,
      ...[...unmatchedStreaks.values()].filter(
        (streak) => streak >= PRIORITY_UNMATCHED_STREAK_THRESHOLD,
      ),
    );
    const maxPriorityStreakTotal =
      maxPairCount * 2 * maxPriorityStreak * priorityStreak;
    const priorityUser =
      maxPriorityStreakTotal + maxMatchedUserTotal + maxCompatibilityTotal + 1;

    return {
      priorityUser,
      priorityStreak,
      matchedUser,
    };
  }

  private calculateRetentionMatchingWeight(input: {
    rawScore: number;
    leftUnmatchedStreak: number;
    rightUnmatchedStreak: number;
    leftIsFirstCycle: boolean;
    rightIsFirstCycle: boolean;
    tiers: RetentionWeightTiers;
  }) {
    const leftPriorityStreak = this.toPriorityStreak(input.leftUnmatchedStreak);
    const rightPriorityStreak = this.toPriorityStreak(
      input.rightUnmatchedStreak,
    );
    const priorityUserCount =
      (leftPriorityStreak > 0 ? 1 : 0) + (rightPriorityStreak > 0 ? 1 : 0);
    const priorityStreakTotal = leftPriorityStreak + rightPriorityStreak;
    const regularStreakTotal =
      this.toRegularStreak(input.leftUnmatchedStreak) +
      this.toRegularStreak(input.rightUnmatchedStreak);
    const newOptInCount =
      (input.leftIsFirstCycle ? 1 : 0) + (input.rightIsFirstCycle ? 1 : 0);

    return (
      priorityUserCount * input.tiers.priorityUser +
      priorityStreakTotal * input.tiers.priorityStreak +
      2 * input.tiers.matchedUser +
      regularStreakTotal * PRE_PRIORITY_UNMATCHED_STREAK_BONUS +
      newOptInCount * NEW_OPT_IN_FIRST_CYCLE_BONUS +
      input.rawScore
    );
  }

  private toPriorityStreak(unmatchedStreak: number) {
    return unmatchedStreak >= PRIORITY_UNMATCHED_STREAK_THRESHOLD
      ? unmatchedStreak
      : 0;
  }

  private toRegularStreak(unmatchedStreak: number) {
    return unmatchedStreak < PRIORITY_UNMATCHED_STREAK_THRESHOLD
      ? unmatchedStreak
      : 0;
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

  private buildPairQuestionSet(
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

  private calculatePairRawScore(
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

  private selectRetentionPriorityPairs(
    participants: EligibleParticipant[],
    candidates: CandidatePair[],
  ) {
    if (candidates.length === 0) {
      return [];
    }

    const participantIndexById = new Map(
      participants.map((participant, index) => [participant.id, index]),
    );
    const edges: [number, number, number][] = [];

    for (const candidate of candidates) {
      const leftIndex = participantIndexById.get(candidate.left.id);
      const rightIndex = participantIndexById.get(candidate.right.id);
      if (leftIndex == null || rightIndex == null) continue;

      const [firstIndex, secondIndex] =
        leftIndex < rightIndex
          ? [leftIndex, rightIndex]
          : [rightIndex, leftIndex];
      edges.push([firstIndex, secondIndex, candidate.matchingWeight]);
    }

    const matchedVertices = blossom(edges);
    return candidates
      .filter((candidate) => {
        const leftIndex = participantIndexById.get(candidate.left.id);
        const rightIndex = participantIndexById.get(candidate.right.id);
        return (
          leftIndex != null &&
          rightIndex != null &&
          matchedVertices[leftIndex] === rightIndex
        );
      })
      .sort((first, second) => this.compareCandidatePairs(first, second));
  }

  private calculateMaxMatchScoreBounds(
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

  private normalizeMatchScore(rawScore: number, scoreBounds: MatchScoreBounds) {
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

import blossom from '../../vendor/edmonds-blossom/index.cjs';
import { MatchingScore } from './matching-score';
import { prepareQuestions } from './matching-questions';
import {
  buildRetentionWeightTiers,
  calculateRetentionMatchingWeight,
} from './matching-priority';
import type {
  EligibleParticipant,
  CandidatePair,
  PreparedQuestion,
  MatchScoreBounds,
  RetentionWeightTiers,
  MatchingInput,
  MatchingResult,
} from './matching-types';
export type {
  EligibleParticipant,
  CandidatePair,
  PreparedQuestion,
  QuestionnaireQuestion,
  MatchingInput,
  MatchingResult,
} from './matching-types';
export { prepareQuestions } from './matching-questions';

export class MatchingEngine {
  private readonly scoring = new MatchingScore();
  constructor(
    private readonly reportStage?: (stage: {
      phase: string;
      participants: number;
      candidates: number;
      elapsedMs: number;
    }) => void,
  ) {}

  calculate(input: MatchingInput): MatchingResult {
    this.scoring.reset();
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
    const scoreBounds = this.scoring.calculateMaxMatchScoreBounds([
      preparedQuestions,
      ...questionnairesByVersionId.values(),
    ]);
    const retentionWeightTiers = buildRetentionWeightTiers(
      participants.length,
      scoreBounds,
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
    this.scoring.clear();

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

    const pairQuestionSet = this.scoring.buildPairQuestionSet(
      input.left,
      input.right,
      input.fallbackQuestions,
      input.questionnairesByVersionId,
    );
    const scored = this.scoring.calculatePairRawScore(
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
    const score = this.scoring.normalizeMatchScore(
      scored.rawScore,
      scored.scoreBounds,
    );

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
        matchingWeight: calculateRetentionMatchingWeight({
          rawScore: scored.rawScore,
          leftUnmatchedStreak,
          rightUnmatchedStreak,
          leftIsVip: input.left.vipActive,
          rightIsVip: input.right.vipActive,
          leftIsEducation: input.left.educationVerified === true,
          rightIsEducation: input.right.educationVerified === true,
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
    const edges: [number, number, bigint][] = [];

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
}

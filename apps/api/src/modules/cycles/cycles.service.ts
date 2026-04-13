import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import blossom from 'edmonds-blossom-fixed';
import { QuestionType } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ensureStickyCycleParticipations } from '../../common/participation/sticky-cycle-participation';
import {
  HardMatchAnswers,
  areHardMatchAnswersCompatible,
  tryReadHardMatchAnswers,
} from '../questionnaire/hard-match';
import {
  labelForQuestionValue,
  normalizeQuestionAnswer,
  normalizeQuestionOptions,
  normalizeQuestionReasonRules,
  renderReasonTemplate,
} from '../questionnaire/questionnaire-config';

const BASE_MATCH_SCORE = 48;
const SINGLE_SELECT_MATCH_BONUS = 6;
const MULTI_SELECT_OVERLAP_BONUS = 3;
const MAX_MATCH_REASONS = 3;
const NORMALIZED_SCORE_MIN = 70;
const NORMALIZED_SCORE_MAX = 100;
const REVEAL_RECOVERY_THRESHOLD_MS = 10 * 60 * 1000;

/** Only ACTIVE users may appear in matching / preview / reveal pools. */
const ACTIVE_OPTED_IN_PARTICIPATION_FILTER: Prisma.CycleParticipationWhereInput =
  {
    status: 'OPTED_IN',
    user: { status: 'ACTIVE' },
  };

type EligibleParticipant = {
  id: string;
  displayName: string | null;
  hardMatchAnswers: HardMatchAnswers;
  answers: Record<string, unknown>;
};

type CandidatePair = {
  left: EligibleParticipant;
  right: EligibleParticipant;
  rawScore: number;
  score: number;
  reasons: string[];
};

type QuestionnaireQuestion = {
  key: string;
  prompt: string;
  type: QuestionType;
  weight: number;
  options: Prisma.JsonValue | null;
  reasonRules: Prisma.JsonValue | null;
};

type RunRevealCycleOptions = {
  force?: boolean;
  cycleId?: string;
  adminActorId?: string;
};

type MatchScoreBounds = {
  min: number;
  max: number;
};

/**
 * Blossom maximizes the sum of edge weights. To maximize matching cardinality
 * first and total raw score second, shift each edge by a prefix derived from
 * score bounds so that one extra matched pair always outweighs any raw-score
 * tradeoff among feasible matchings.
 */
function lexicographicMatchingEdgeWeight(
  rawScore: number,
  participantCount: number,
  scoreBounds: MatchScoreBounds,
): number {
  const maxPairs = Math.floor(participantCount / 2);
  if (maxPairs <= 0) {
    return rawScore;
  }

  let lexPrefix =
    (maxPairs - 1) * scoreBounds.max - maxPairs * scoreBounds.min + 1;

  if (lexPrefix < 1) {
    lexPrefix = maxPairs * scoreBounds.max + 1;
  }

  return lexPrefix + rawScore;
}

function buildInsufficientParticipantsMessage(
  optedInCount: number,
  eligibleCount: number,
): string {
  const prefix = 'Not enough complete participants to generate matches.';
  if (optedInCount === 0) {
    return `${prefix} No users are opted in (OPTED_IN) for this cycle. At least 2 opted-in users with valid hard-matching questionnaire answers are required.`;
  }
  if (eligibleCount === 0) {
    return `${prefix} ${optedInCount} user(s) opted in, but none have valid hard-matching questionnaire answers (birth date, partner age range, gender / partner genders, looks / partner looks, height / partner height range).`;
  }
  return `${prefix} Only ${eligibleCount} of ${optedInCount} opted-in user(s) are eligible; at least 2 are required.`;
}

@Injectable()
export class CyclesService {
  constructor(private readonly prisma: PrismaService) {}

  async runRevealCycle(options: RunRevealCycleOptions = {}) {
    const [cycleCandidate, questionnaire] = await Promise.all([
      this.loadRunnableCycle(options.cycleId),
      this.prisma.questionnaireVersion.findFirst({
        where: { isCurrent: true },
        include: {
          questions: {
            orderBy: { order: 'asc' },
          },
        },
      }),
    ]);

    let cycle = cycleCandidate;

    if (!cycle) {
      if (options.cycleId) {
        throw new NotFoundException('Cycle not found.');
      }

      return { ok: true, message: 'No open cycle was found.' };
    }

    const stickyParticipationInitialization =
      await ensureStickyCycleParticipations(this.prisma, cycle);

    if (stickyParticipationInitialization.createdCount > 0) {
      cycle = await this.loadRunnableCycle(cycle.id);

      if (!cycle) {
        throw new NotFoundException('Cycle not found.');
      }
    }

    if (cycle.status === 'REVEAL_READY') {
      if (!this.isStaleRevealProcessing(cycle.updatedAt)) {
        return {
          ok: true,
          message: 'Cycle is already being processed.',
        };
      }

      await this.resetCycleToOpen(cycle.id);
      cycle = {
        ...cycle,
        status: 'OPEN',
      };
    }

    if (cycle.status !== 'OPEN') {
      throw new BadRequestException('Only open cycles can be executed.');
    }

    if (!options?.force && cycle.revealAt > new Date()) {
      throw new BadRequestException('Reveal time has not been reached yet.');
    }

    if (!questionnaire) {
      return { ok: false, message: 'Current questionnaire is not configured.' };
    }

    const claimResult = await this.prisma.matchCycle.updateMany({
      where: {
        id: cycle.id,
        status: 'OPEN',
      },
      data: {
        status: 'REVEAL_READY',
      },
    });

    if (claimResult.count === 0) {
      return {
        ok: true,
        message: 'Cycle is already being processed.',
      };
    }

    const optedInCount = cycle.participations.length;
    const participants = this.toEligibleParticipants(cycle.participations);

    if (participants.length < 2) {
      await this.resetCycleToOpen(cycle.id);
      return {
        ok: true,
        message: buildInsufficientParticipantsMessage(
          optedInCount,
          participants.length,
        ),
      };
    }

    const { selectedPairs } = await this.calculatePairs(
      participants,
      questionnaire.questions,
      cycle.revealAt,
      cycle.id,
    );

    if (selectedPairs.length === 0) {
      await this.resetCycleToOpen(cycle.id);
      return {
        ok: true,
        message: 'No compatible pairs were found for this cycle.',
      };
    }

    const unmatchedCount = participants.length - selectedPairs.length * 2;

    try {
      await this.prisma.$transaction(async (tx) => {
        let clearedMatches = 0;
        if (options?.force) {
          const deleted = await tx.match.deleteMany({
            where: { cycleId: cycle.id },
          });
          clearedMatches = deleted.count;
        }

        for (const pair of selectedPairs) {
          await tx.match.create({
            data: {
              cycleId: cycle.id,
              score: pair.score,
              reasons: pair.reasons,
              revealedAt: new Date(),
              participants: {
                create: [
                  {
                    cycleId: cycle.id,
                    userId: pair.left.id,
                    position: 1,
                  },
                  {
                    cycleId: cycle.id,
                    userId: pair.right.id,
                    position: 2,
                  },
                ],
              },
            },
          });
        }

        await tx.matchCycle.update({
          where: { id: cycle.id },
          data: {
            status: 'REVEALED',
          },
        });

        await tx.auditLog.create({
          data: {
            adminActorId: options.adminActorId,
            action: 'cycle.revealed',
            metadata: {
              cycleId: cycle.id,
              createdMatches: selectedPairs.length,
              unmatchedCount,
              forced: options?.force ?? false,
              ...(clearedMatches > 0 ? { clearedMatches } : {}),
            },
          },
        });
      });
    } catch (error) {
      await this.resetCycleToOpen(cycle.id);
      throw error;
    }

    const result = {
      ok: true,
      cycleId: cycle.id,
      createdMatches: selectedPairs.length,
      unmatchedCount,
    };

    return result;
  }

  async previewCycle(cycleId: string) {
    const [initialCycle, questionnaire] = await Promise.all([
      this.prisma.matchCycle.findUnique({
        where: { id: cycleId },
        include: {
          participations: {
            where: ACTIVE_OPTED_IN_PARTICIPATION_FILTER,
            include: {
              user: {
                include: {
                  questionnaireResponse: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.questionnaireVersion.findFirst({
        where: { isCurrent: true },
        include: {
          questions: {
            orderBy: { order: 'asc' },
          },
        },
      }),
    ]);

    if (!initialCycle) {
      throw new NotFoundException('Cycle not found.');
    }

    const stickyParticipationInitialization =
      await ensureStickyCycleParticipations(this.prisma, initialCycle);
    const cycle =
      stickyParticipationInitialization.createdCount > 0
        ? await this.prisma.matchCycle.findUnique({
            where: { id: cycleId },
            include: {
              participations: {
                where: ACTIVE_OPTED_IN_PARTICIPATION_FILTER,
                include: {
                  user: {
                    include: {
                      questionnaireResponse: true,
                    },
                  },
                },
              },
            },
          })
        : initialCycle;

    if (!cycle) {
      throw new NotFoundException('Cycle not found.');
    }

    if (!questionnaire) {
      return {
        cycleId,
        message: 'Current questionnaire is not configured.',
        candidates: [],
        suggestedPairs: [],
        unmatchedUserIds: [],
      };
    }

    const participants = this.toEligibleParticipants(cycle.participations);
    const { candidates, selectedPairs } = await this.calculatePairs(
      participants,
      questionnaire.questions,
      cycle.revealAt,
      cycle.id,
    );
    const matchedUserIds = new Set(
      selectedPairs.flatMap((pair) => [pair.left.id, pair.right.id]),
    );

    return {
      cycleId,
      totalCandidateCount: candidates.length,
      candidates: candidates.slice(0, 20).map((pair) => ({
        leftUserId: pair.left.id,
        rightUserId: pair.right.id,
        leftDisplayName: pair.left.displayName,
        rightDisplayName: pair.right.displayName,
        score: pair.score,
        reasons: pair.reasons,
      })),
      suggestedPairs: selectedPairs.map((pair) => ({
        leftUserId: pair.left.id,
        rightUserId: pair.right.id,
        leftDisplayName: pair.left.displayName,
        rightDisplayName: pair.right.displayName,
        score: pair.score,
        reasons: pair.reasons,
      })),
      unmatchedUserIds: participants
        .filter((participant) => !matchedUserIds.has(participant.id))
        .map((participant) => participant.id),
    };
  }

  private createPairKey(firstUserId: string, secondUserId: string) {
    return [firstUserId, secondUserId].sort().join('::');
  }

  private buildHistoricalPairKeySet(
    matches: Array<{ participants: Array<{ userId: string }> }>,
  ) {
    return new Set(
      matches
        .map((match) => {
          const ids = match.participants.map(
            (participant) => participant.userId,
          );

          if (ids.length !== 2) {
            return null;
          }

          return this.createPairKey(ids[0], ids[1]);
        })
        .filter((value): value is string => Boolean(value)),
    );
  }

  private loadHistoricalPairKeys(
    participantIds: string[],
    currentCycleId?: string,
  ) {
    return this.prisma.match
      .findMany({
        where: {
          participants: {
            some: { userId: { in: participantIds } },
          },
          ...(currentCycleId ? { cycleId: { not: currentCycleId } } : {}),
        },
        select: {
          participants: {
            select: {
              userId: true,
            },
          },
        },
      })
      .then((matches) => this.buildHistoricalPairKeySet(matches));
  }

  private loadRunnableCycle(cycleId?: string) {
    const include = {
      participations: {
        where: ACTIVE_OPTED_IN_PARTICIPATION_FILTER,
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              questionnaireResponse: true,
            },
          },
        },
      },
    };

    if (cycleId) {
      return this.prisma.matchCycle.findUnique({
        where: { id: cycleId },
        include,
      });
    }

    return this.prisma.matchCycle.findFirst({
      where: {
        status: {
          in: ['OPEN', 'REVEAL_READY'],
        },
      },
      orderBy: { revealAt: 'asc' },
      include,
    });
  }

  private toEligibleParticipants(
    participations: Array<{
      user: {
        id: string;
        displayName: string | null;
        questionnaireResponse: {
          answers: Prisma.JsonValue;
        } | null;
      };
    }>,
  ) {
    return participations
      .map((entry) => entry.user)
      .map((user) => {
        if (!user.questionnaireResponse) {
          return null;
        }

        const answers = (user.questionnaireResponse.answers ?? {}) as Record<
          string,
          unknown
        >;
        const hardMatchAnswers = tryReadHardMatchAnswers(answers);

        if (!hardMatchAnswers) {
          return null;
        }

        return {
          id: user.id,
          displayName: user.displayName,
          hardMatchAnswers,
          answers,
        } satisfies EligibleParticipant;
      })
      .filter(
        (participant): participant is EligibleParticipant =>
          participant !== null,
      );
  }

  private async calculatePairs(
    participants: EligibleParticipant[],
    questions: QuestionnaireQuestion[],
    revealAt: Date,
    currentCycleId?: string,
  ) {
    const scoreBounds = this.calculateMatchScoreBounds(questions);
    const participantIds = participants.map((participant) => participant.id);

    const [blocks, historicalPairKeys] = await Promise.all([
      this.prisma.block.findMany({
        where: {
          OR: [
            { blockerId: { in: participantIds } },
            { blockedId: { in: participantIds } },
          ],
        },
      }),
      this.loadHistoricalPairKeys(participantIds, currentCycleId),
    ]);

    const blockedPairKeys = new Set(
      blocks.map((block) =>
        this.createPairKey(block.blockerId, block.blockedId),
      ),
    );

    const candidates: CandidatePair[] = [];

    for (let leftIndex = 0; leftIndex < participants.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < participants.length;
        rightIndex += 1
      ) {
        const left = participants[leftIndex];
        const right = participants[rightIndex];
        const pairKey = this.createPairKey(left.id, right.id);

        if (blockedPairKeys.has(pairKey) || historicalPairKeys.has(pairKey)) {
          continue;
        }

        const scored = this.scorePair(
          left,
          right,
          questions,
          revealAt,
          scoreBounds,
        );
        if (!scored) {
          continue;
        }

        candidates.push({
          left,
          right,
          rawScore: scored.rawScore,
          score: scored.score,
          reasons: scored.reasons,
        });
      }
    }

    candidates.sort((first, second) => {
      if (second.score !== first.score) {
        return second.score - first.score;
      }

      return this.createPairKey(first.left.id, first.right.id).localeCompare(
        this.createPairKey(second.left.id, second.right.id),
      );
    });
    const selectedPairs = this.selectOptimalDisjointPairs(
      candidates,
      participants,
      scoreBounds,
    );

    return {
      candidates,
      selectedPairs,
    };
  }

  private scorePair(
    left: EligibleParticipant,
    right: EligibleParticipant,
    questions: Array<{
      key: string;
      prompt: string;
      type: QuestionType;
      weight: number;
      options: Prisma.JsonValue | null;
      reasonRules: Prisma.JsonValue | null;
    }>,
    revealAt: Date,
    scoreBounds = this.calculateMatchScoreBounds(questions),
  ) {
    if (
      !areHardMatchAnswersCompatible(
        left.hardMatchAnswers,
        right.hardMatchAnswers,
        revealAt,
      )
    ) {
      return null;
    }

    let rawScore = BASE_MATCH_SCORE;
    const reasons: Array<{ text: string; priority: number; order: number }> =
      [];

    for (const [order, question] of questions.entries()) {
      const leftAnswer = normalizeQuestionAnswer(
        question,
        left.answers[question.key],
        { invalidAsNull: true },
      );
      const rightAnswer = normalizeQuestionAnswer(
        question,
        right.answers[question.key],
        { invalidAsNull: true },
      );
      const weight = question.weight;

      if (leftAnswer == null || rightAnswer == null) {
        continue;
      }

      if (
        (question.type === QuestionType.SINGLE_SELECT ||
          question.type === QuestionType.SCALE) &&
        leftAnswer === rightAnswer
      ) {
        rawScore += weight * SINGLE_SELECT_MATCH_BONUS;
        reasons.push(
          ...this.buildReasonMessages(question, leftAnswer, rightAnswer, order),
        );
      }

      if (question.type === QuestionType.MULTI_SELECT) {
        const leftOptions = Array.isArray(leftAnswer) ? leftAnswer : [];
        const rightOptions = Array.isArray(rightAnswer) ? rightAnswer : [];
        const overlap = leftOptions.filter((value) =>
          rightOptions.includes(value),
        );

        if (overlap.length > 0) {
          rawScore += overlap.length * weight * MULTI_SELECT_OVERLAP_BONUS;
          reasons.push(
            ...this.buildReasonMessages(
              question,
              leftAnswer,
              rightAnswer,
              order,
            ),
          );
        }
      }
    }

    const uniqueReasonMap = new Map<
      string,
      { text: string; priority: number; order: number }
    >();

    for (const reason of reasons) {
      const existingReason = uniqueReasonMap.get(reason.text);
      if (
        !existingReason ||
        reason.priority > existingReason.priority ||
        (reason.priority === existingReason.priority &&
          reason.order < existingReason.order)
      ) {
        uniqueReasonMap.set(reason.text, reason);
      }
    }

    const uniqueReasons = [...uniqueReasonMap.values()]
      .sort(
        (leftReason, rightReason) =>
          rightReason.priority - leftReason.priority ||
          leftReason.order - rightReason.order,
      )
      .slice(0, MAX_MATCH_REASONS)
      .map((reason) => reason.text);

    return {
      rawScore,
      score: this.normalizeMatchScore(rawScore, scoreBounds),
      reasons:
        uniqueReasons.length > 0
          ? uniqueReasons
          : ['你们在多项关系与生活方式判断上表现出相容趋势。'],
    };
  }

  private buildReasonMessages(
    question: QuestionnaireQuestion,
    leftAnswer: string | string[],
    rightAnswer: string | string[],
    order: number,
  ) {
    const optionList = normalizeQuestionOptions(question.options);
    const rules = normalizeQuestionReasonRules(question.reasonRules);

    return rules
      .map((rule) => {
        if (rule.type === 'EXACT_MATCH') {
          if (
            typeof leftAnswer !== 'string' ||
            typeof rightAnswer !== 'string' ||
            leftAnswer !== rightAnswer
          ) {
            return null;
          }

          const text = renderReasonTemplate(rule.template, {
            answer_label: labelForQuestionValue(leftAnswer, optionList),
            question_prompt: question.prompt,
            question_key: question.key,
            count: 1,
          }).trim();

          if (!text) {
            return null;
          }

          return {
            text,
            priority: rule.priority ?? question.weight,
            order,
          };
        }

        if (!Array.isArray(leftAnswer) || !Array.isArray(rightAnswer)) {
          return null;
        }

        const overlap = leftAnswer.filter((value) =>
          rightAnswer.includes(value),
        );
        if (overlap.length < (rule.minOverlap ?? 1)) {
          return null;
        }

        const overlapLabels = overlap.map((value) =>
          labelForQuestionValue(value, optionList),
        );
        const maxLabels = rule.maxLabels ?? overlapLabels.length;
        const visibleLabels = overlapLabels.slice(0, maxLabels);
        const text = renderReasonTemplate(rule.template, {
          labels: visibleLabels.join('、'),
          labels_2: overlapLabels.slice(0, 2).join('、'),
          labels_3: overlapLabels.slice(0, 3).join('、'),
          question_prompt: question.prompt,
          question_key: question.key,
          count: overlap.length,
        }).trim();

        if (!text) {
          return null;
        }

        return {
          text,
          priority: rule.priority ?? question.weight,
          order,
        };
      })
      .filter(
        (reason): reason is { text: string; priority: number; order: number } =>
          reason !== null,
      );
  }

  private selectOptimalDisjointPairs(
    candidates: CandidatePair[],
    participants: EligibleParticipant[],
    scoreBounds: MatchScoreBounds,
  ) {
    if (candidates.length === 0) {
      return [];
    }

    const participantIndexById = new Map(
      participants.map((participant, index) => [participant.id, index]),
    );
    const candidateByPairKey = new Map(
      candidates.map((candidate) => [
        this.createPairKey(candidate.left.id, candidate.right.id),
        candidate,
      ]),
    );
    const edges: Array<[number, number, number]> = candidates.map(
      (candidate) => {
        const leftIndex = participantIndexById.get(candidate.left.id);
        const rightIndex = participantIndexById.get(candidate.right.id);

        if (leftIndex == null || rightIndex == null) {
          throw new BadRequestException(
            'Candidate pair contains a participant outside the current cycle.',
          );
        }

        const blossomWeight = lexicographicMatchingEdgeWeight(
          candidate.rawScore,
          participants.length,
          scoreBounds,
        );

        return [leftIndex, rightIndex, blossomWeight];
      },
    );
    const mateByIndex = blossom(edges, true);

    const selectedPairs: CandidatePair[] = [];

    for (let leftIndex = 0; leftIndex < mateByIndex.length; leftIndex += 1) {
      const rightIndex = mateByIndex[leftIndex];
      if (
        !Number.isInteger(rightIndex) ||
        rightIndex < 0 ||
        rightIndex <= leftIndex
      ) {
        continue;
      }

      const left = participants[leftIndex];
      const right = participants[rightIndex];
      if (!left || !right) {
        continue;
      }

      const candidate = candidateByPairKey.get(
        this.createPairKey(left.id, right.id),
      );
      if (candidate) {
        selectedPairs.push(candidate);
      }
    }

    selectedPairs.sort((first, second) => {
      if (second.score !== first.score) {
        return second.score - first.score;
      }

      return this.createPairKey(first.left.id, first.right.id).localeCompare(
        this.createPairKey(second.left.id, second.right.id),
      );
    });

    return selectedPairs;
  }

  private calculateMatchScoreBounds(
    questions: Array<{
      type: QuestionType;
      weight: number;
      selectionLimit?: number | null;
      options: Prisma.JsonValue | null;
      prompt: string;
    }>,
  ): MatchScoreBounds {
    let max = BASE_MATCH_SCORE;

    for (const question of questions) {
      if (
        question.type === QuestionType.SINGLE_SELECT ||
        question.type === QuestionType.SCALE
      ) {
        max += question.weight * SINGLE_SELECT_MATCH_BONUS;
        continue;
      }

      if (question.type === QuestionType.MULTI_SELECT) {
        max +=
          this.getMaxMultiSelectOverlap(question) *
          question.weight *
          MULTI_SELECT_OVERLAP_BONUS;
      }
    }

    return {
      min: BASE_MATCH_SCORE,
      max,
    };
  }

  private getMaxMultiSelectOverlap(question: {
    prompt: string;
    selectionLimit?: number | null;
    options: Prisma.JsonValue | null;
  }) {
    const optionCount = normalizeQuestionOptions(question.options).length;
    const selectionLimit = question.selectionLimit ?? null;

    if (selectionLimit != null) {
      if (!Number.isInteger(selectionLimit) || selectionLimit < 0) {
        throw new BadRequestException(
          `Question "${question.prompt}" has an invalid selection limit.`,
        );
      }

      if (optionCount === 0) {
        return selectionLimit;
      }

      return Math.min(selectionLimit, optionCount);
    }

    if (optionCount === 0) {
      throw new BadRequestException(
        `Question "${question.prompt}" must define options or a selection limit before match scores can be normalized.`,
      );
    }

    return optionCount;
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

  private async resetCycleToOpen(cycleId: string) {
    await this.prisma.matchCycle.update({
      where: { id: cycleId },
      data: {
        status: 'OPEN',
      },
    });
  }

  private isStaleRevealProcessing(updatedAt: Date) {
    return Date.now() - updatedAt.getTime() >= REVEAL_RECOVERY_THRESHOLD_MS;
  }
}

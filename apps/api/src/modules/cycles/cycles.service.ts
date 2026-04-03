import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QuestionType } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
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
const REVEAL_RECOVERY_THRESHOLD_MS = 10 * 60 * 1000;

type EligibleParticipant = {
  id: string;
  displayName: string | null;
  hardMatchAnswers: HardMatchAnswers;
  answers: Record<string, unknown>;
};

type CandidatePair = {
  left: EligibleParticipant;
  right: EligibleParticipant;
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

    const participants = this.toEligibleParticipants(cycle.participations);

    if (participants.length < 2) {
      await this.resetCycleToOpen(cycle.id);
      return {
        ok: true,
        message: 'Not enough complete participants to generate matches.',
      };
    }

    const { selectedPairs } = await this.calculatePairs(
      participants,
      questionnaire.questions,
      cycle.revealAt,
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
      await this.prisma.$transaction([
        ...selectedPairs.map((pair) =>
          this.prisma.match.create({
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
          }),
        ),
        this.prisma.matchCycle.update({
          where: { id: cycle.id },
          data: {
            status: 'REVEALED',
          },
        }),
        this.prisma.auditLog.create({
          data: {
            adminActorId: options.adminActorId,
            action: 'cycle.revealed',
            metadata: {
              cycleId: cycle.id,
              createdMatches: selectedPairs.length,
              unmatchedCount,
              forced: options?.force ?? false,
            },
          },
        }),
      ]);
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
    const [cycle, questionnaire] = await Promise.all([
      this.prisma.matchCycle.findUnique({
        where: { id: cycleId },
        include: {
          participations: {
            where: { status: 'OPTED_IN' },
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

  private loadRunnableCycle(cycleId?: string) {
    const include = {
      participations: {
        where: {
          status: 'OPTED_IN' as const,
        },
        include: {
          user: {
            include: {
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
        schoolId: string | null;
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
  ) {
    const participantIds = participants.map((participant) => participant.id);

    const [blocks, priorMatches] = await Promise.all([
      this.prisma.block.findMany({
        where: {
          OR: [
            { blockerId: { in: participantIds } },
            { blockedId: { in: participantIds } },
          ],
        },
      }),
      this.prisma.match.findMany({
        where: {
          participants: {
            some: { userId: { in: participantIds } },
          },
        },
        include: { participants: true },
      }),
    ]);

    const blockedPairKeys = new Set(
      blocks.map((block) =>
        this.createPairKey(block.blockerId, block.blockedId),
      ),
    );
    const historicalPairKeys = new Set(
      priorMatches
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

        const scored = this.scorePair(left, right, questions, revealAt);
        if (!scored) {
          continue;
        }

        candidates.push({
          left,
          right,
          score: scored.score,
          reasons: scored.reasons,
        });
      }
    }

    candidates.sort((first, second) => second.score - first.score);

    const usedUserIds = new Set<string>();
    const selectedPairs = candidates.filter((candidate) => {
      if (
        usedUserIds.has(candidate.left.id) ||
        usedUserIds.has(candidate.right.id)
      ) {
        return false;
      }

      usedUserIds.add(candidate.left.id);
      usedUserIds.add(candidate.right.id);
      return true;
    });

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

    let score = BASE_MATCH_SCORE;
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
        score += weight * SINGLE_SELECT_MATCH_BONUS;
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
          score += overlap.length * weight * MULTI_SELECT_OVERLAP_BONUS;
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
      score,
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

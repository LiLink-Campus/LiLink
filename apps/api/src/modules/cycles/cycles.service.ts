import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QuestionType } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type EligibleParticipant = {
  id: string;
  schoolId: string | null;
  displayName: string | null;
  profile: {
    allowCrossSchool: boolean;
    preferCrossSchool: boolean;
    schoolYear: string | null;
    programName: string | null;
    languages: Prisma.JsonValue | null;
    interests: Prisma.JsonValue | null;
  };
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
  type: QuestionType;
  weight: number;
  options: Prisma.JsonValue | null;
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
    const [cycle, questionnaire] = await Promise.all([
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

    if (!cycle) {
      if (options.cycleId) {
        throw new NotFoundException('Cycle not found.');
      }

      return { ok: true, message: 'No open cycle was found.' };
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
                  profile: true,
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
    );
    const matchedUserIds = new Set(
      selectedPairs.flatMap((pair) => [pair.left.id, pair.right.id]),
    );

    return {
      cycleId,
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
              profile: true,
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
      where: { status: 'OPEN' },
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
        profile: {
          allowCrossSchool: boolean;
          preferCrossSchool: boolean;
          schoolYear: string | null;
          programName: string | null;
          languages: Prisma.JsonValue | null;
          interests: Prisma.JsonValue | null;
        } | null;
        questionnaireResponse: {
          answers: Prisma.JsonValue;
        } | null;
      };
    }>,
  ) {
    return participations
      .map((entry) => entry.user)
      .filter((user) => user.profile && user.questionnaireResponse)
      .map<EligibleParticipant>((user) => ({
        id: user.id,
        schoolId: user.schoolId,
        displayName: user.displayName,
        profile: {
          allowCrossSchool: user.profile!.allowCrossSchool,
          preferCrossSchool: user.profile!.preferCrossSchool,
          schoolYear: user.profile!.schoolYear,
          programName: user.profile!.programName,
          languages: user.profile!.languages,
          interests: user.profile!.interests,
        },
        answers: (user.questionnaireResponse!.answers ?? {}) as Record<
          string,
          unknown
        >,
      }));
  }

  private async calculatePairs(
    participants: EligibleParticipant[],
    questions: QuestionnaireQuestion[],
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

        const scored = this.scorePair(left, right, questions);
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
      type: QuestionType;
      weight: number;
      options: Prisma.JsonValue | null;
    }>,
  ) {
    const sameSchool =
      left.schoolId && right.schoolId && left.schoolId === right.schoolId;

    if (
      !sameSchool &&
      (!left.profile.allowCrossSchool || !right.profile.allowCrossSchool)
    ) {
      return null;
    }

    let score = 48;
    const reasons: string[] = [];

    for (const question of questions) {
      const leftAnswer = left.answers[question.key];
      const rightAnswer = right.answers[question.key];
      const weight = question.weight;

      if (leftAnswer == null || rightAnswer == null) {
        continue;
      }

      if (
        (question.type === QuestionType.SINGLE_SELECT ||
          question.type === QuestionType.SCALE) &&
        leftAnswer === rightAnswer
      ) {
        score += weight * 6;

        if (question.key === 'pace') {
          reasons.push('你们对关系推进节奏的期待很接近。');
        }

        if (question.key === 'weekend') {
          reasons.push('你们对周末相处方式的偏好相近。');
        }

        if (question.key === 'communication') {
          reasons.push('你们处理分歧时更容易对齐彼此的沟通方式。');
        }
      }

      if (question.type === QuestionType.MULTI_SELECT) {
        const leftOptions = this.normalizeStringArray(leftAnswer);
        const rightOptions = this.normalizeStringArray(rightAnswer);
        const overlap = leftOptions.filter((value) =>
          rightOptions.includes(value),
        );

        if (overlap.length > 0) {
          score += overlap.length * weight * 3;

          if (question.key === 'values') {
            reasons.push(
              `你们都把 ${overlap.slice(0, 2).join('、')} 放在重要位置。`,
            );
          }
        }
      }

      if (
        question.type === QuestionType.SHORT_TEXT &&
        typeof leftAnswer === 'string' &&
        typeof rightAnswer === 'string' &&
        leftAnswer.trim() &&
        rightAnswer.trim()
      ) {
        score += weight * 2;
      }
    }

    if (
      left.profile.schoolYear &&
      right.profile.schoolYear &&
      left.profile.schoolYear === right.profile.schoolYear
    ) {
      score += 4;
      reasons.push('你们处在接近的学习阶段，时间节奏更容易协调。');
    }

    if (
      left.profile.programName &&
      right.profile.programName &&
      left.profile.programName === right.profile.programName
    ) {
      score += 3;
    }

    const sharedInterests = this.findOverlap(
      this.normalizeStringArray(left.profile.interests),
      this.normalizeStringArray(right.profile.interests),
    );
    if (sharedInterests.length > 0) {
      score += Math.min(sharedInterests.length, 3) * 2;
      reasons.push(
        `你们在兴趣上有交集，比如 ${sharedInterests.slice(0, 2).join('、')}。`,
      );
    }

    const sharedLanguages = this.findOverlap(
      this.normalizeStringArray(left.profile.languages),
      this.normalizeStringArray(right.profile.languages),
    );
    if (sharedLanguages.length > 0) {
      score += sharedLanguages.length;
    }

    if (
      !sameSchool &&
      left.profile.preferCrossSchool &&
      right.profile.preferCrossSchool
    ) {
      score += 3;
      reasons.push('你们都对跨校连接持开放甚至偏好的态度。');
    }

    const uniqueReasons = [...new Set(reasons)].slice(0, 3);

    return {
      score,
      reasons:
        uniqueReasons.length > 0
          ? uniqueReasons
          : ['你们在多项关系与生活方式判断上表现出相容趋势。'],
    };
  }

  private normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value.filter((item): item is string => typeof item === 'string');
  }

  private findOverlap(left: string[], right: string[]) {
    return left.filter((value) => right.includes(value));
  }

  private async resetCycleToOpen(cycleId: string) {
    await this.prisma.matchCycle.update({
      where: { id: cycleId },
      data: {
        status: 'OPEN',
      },
    });
  }
}

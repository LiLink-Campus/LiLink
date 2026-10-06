import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { type CandidatePair } from './matching.engine';
import {
  PREPARATION_RECOVERY_THRESHOLD_MS,
  CyclePreparationResult,
  PreparationClaimLostError,
  buildInsufficientParticipantsMessage,
} from './cycle-processing';
import { CycleMatchingInputService } from './cycle-matching-input.service';
import { CycleMatchingService } from './cycle-matching.service';
import { CyclePreparationStateService } from './cycle-preparation-state.service';
@Injectable()
export class CyclePreparationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly input: CycleMatchingInputService,
    private readonly matching: CycleMatchingService,
    private readonly state: CyclePreparationStateService,
  ) {}
  async prepareCycle(options: {
    cycleId: string;
    force?: boolean;
    adminActorId?: string;
  }): Promise<CyclePreparationResult> {
    const [cycleCandidate, questionnaire] = await Promise.all([
      this.input.loadCycleForProcessing(options.cycleId),
      this.prisma.questionnaireVersion.findFirst({
        where: { isCurrent: true },
        include: {
          questions: {
            orderBy: { order: 'asc' },
          },
        },
      }),
    ]);

    const cycle = cycleCandidate;

    if (!cycle) {
      throw new NotFoundException('Cycle not found.');
    }

    if (cycle.status === 'REVEAL_READY') {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'SKIPPED',
        createdMatches: 0,
        unmatchedCount: 0,
        message: 'Cycle is already prepared and waiting for reveal.',
      };
    }

    if (cycle.status === 'REVEALED') {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'SKIPPED',
        createdMatches: 0,
        unmatchedCount: 0,
        message: 'Cycle has already been revealed.',
      };
    }

    if (cycle.status !== 'OPEN') {
      throw new BadRequestException('Only open cycles can be prepared.');
    }

    if (!options.force && cycle.participationDeadline > new Date()) {
      throw new BadRequestException(
        'Participation deadline has not been reached yet.',
      );
    }

    if (!questionnaire) {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'SKIPPED',
        createdMatches: 0,
        unmatchedCount: 0,
        message: 'Current questionnaire is not configured.',
      };
    }

    const claimUpdatedAt = new Date();
    const claimResult = await this.prisma.matchCycle.updateMany({
      where: {
        id: cycle.id,
        status: 'OPEN',
      },
      data: {
        status: 'PREPARING',
        updatedAt: claimUpdatedAt,
      },
    });

    if (claimResult.count === 0) {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'SKIPPED',
        createdMatches: 0,
        unmatchedCount: 0,
        message: 'Cycle is already being prepared.',
      };
    }

    try {
      const optedInCount = cycle.participations.length;
      const participants = this.input.toEligibleParticipants(
        cycle.participations,
        questionnaire,
        (await this.prisma.school.findMany({ select: { id: true } })).map(
          (school) => school.id,
        ),
      );
      const questionnairesByVersionId =
        await this.input.loadQuestionnairesByVersionId(
          participants,
          questionnaire,
        );

      let selectedPairs: CandidatePair[] = [];
      let preparationMessage = 'Cycle is prepared and waiting for reveal.';

      if (participants.length < 2) {
        preparationMessage = `${buildInsufficientParticipantsMessage(
          optedInCount,
          participants.length,
        )} The cycle has been prepared and will reveal zero matches.`;
      } else {
        const calculatedPairs = await this.matching.calculatePairs(
          participants,
          questionnaire.questions,
          cycle.revealAt,
          cycle.id,
          questionnairesByVersionId,
        );

        selectedPairs = calculatedPairs.selectedPairs;

        if (selectedPairs.length === 0) {
          preparationMessage =
            'No compatible pairs were found for this cycle. The cycle has been prepared and will reveal zero matches.';
        }
      }

      const unmatchedCount = participants.length - selectedPairs.length * 2;

      await this.prisma.$transaction(
        async (tx) => {
          const activeClaim = await tx.matchCycle.updateMany({
            where: {
              id: cycle.id,
              status: 'PREPARING',
              updatedAt: claimUpdatedAt,
            },
            data: {
              updatedAt: claimUpdatedAt,
            },
          });

          if (activeClaim.count === 0) {
            throw new PreparationClaimLostError();
          }

          if (selectedPairs.length > 0) {
            const matches = selectedPairs.map((pair) => ({
              id: randomUUID(),
              cycleId: cycle.id,
              score: pair.score,
            }));
            await tx.match.createMany({ data: matches });
            await tx.matchParticipant.createMany({
              data: selectedPairs.flatMap((pair, index) =>
                [pair.left, pair.right].map((participant, position) => ({
                  matchId: matches[index].id,
                  cycleId: cycle.id,
                  userId: participant.id,
                  position: position + 1,
                  profileSnapshot: {
                    source: 'matching-preparation',
                    versionId: participant.questionnaireVersionId,
                    introLine: participant.hardMatchAnswers.oneLinerIntro,
                    gender: participant.hardMatchAnswers.gender,
                    partnerGenders: participant.hardMatchAnswers.partnerGenders,
                  },
                })),
              ),
            });
          }

          if (selectedPairs.length === 0) {
            const finalizedCycle = await tx.matchCycle.updateMany({
              where: {
                id: cycle.id,
                status: 'PREPARING',
                updatedAt: claimUpdatedAt,
              },
              data: {
                status: 'REVEAL_READY',
              },
            });

            if (finalizedCycle.count === 0) {
              throw new PreparationClaimLostError();
            }

            await tx.auditLog.create({
              data: {
                adminActorId: options.adminActorId,
                action: 'cycle.prepared',
                metadata: {
                  cycleId: cycle.id,
                  createdMatches: selectedPairs.length,
                  unmatchedCount,
                  forced: options.force ?? false,
                  message: preparationMessage,
                },
              },
            });

            return;
          }
        },
        { timeout: 30_000 },
      );

      if (selectedPairs.length === 0) {
        return {
          ok: true,
          cycleId: cycle.id,
          state: 'PREPARED',
          createdMatches: 0,
          unmatchedCount,
          message: preparationMessage,
        };
      }

      return this.state.finalizePreparedCycle({
        cycleId: cycle.id,
        claimUpdatedAt,
        adminActorId: options.adminActorId,
        force: options.force,
        createdMatches: selectedPairs.length,
        unmatchedCount,
        message: preparationMessage,
      });
    } catch (error) {
      await this.state.revertPreparationClaimIfEmpty(cycle.id, claimUpdatedAt);

      if (error instanceof PreparationClaimLostError) {
        return {
          ok: true,
          cycleId: cycle.id,
          state: 'SKIPPED',
          createdMatches: 0,
          unmatchedCount: 0,
          message: error.message,
        };
      }

      throw error;
    }
  }

  async continuePreparingCycle(options: {
    cycleId: string;
    force?: boolean;
    adminActorId?: string;
  }): Promise<CyclePreparationResult> {
    const cycle = await this.input.loadCycleForProcessing(options.cycleId);

    if (!cycle) {
      throw new NotFoundException('Cycle not found.');
    }

    if (cycle.status === 'REVEAL_READY') {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'PREPARED',
        createdMatches: await this.prisma.match.count({
          where: { cycleId: cycle.id },
        }),
        unmatchedCount: 0,
        message: 'Cycle is already prepared and waiting for reveal.',
      };
    }

    if (cycle.status !== 'PREPARING') {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'SKIPPED',
        createdMatches: 0,
        unmatchedCount: 0,
        message: 'Cycle is not in preparing state.',
      };
    }

    const totalMatchCount = await this.prisma.match.count({
      where: { cycleId: cycle.id },
    });
    const unmatchedCount = Math.max(
      0,
      cycle.participations.length - totalMatchCount * 2,
    );

    if (totalMatchCount === 0) {
      const recoveredPreparation = await this.recoverStaleEmptyPreparation(
        cycle,
        options,
        unmatchedCount,
      );

      if (recoveredPreparation) {
        return recoveredPreparation;
      }

      return {
        ok: true,
        cycleId: cycle.id,
        state: 'PENDING',
        createdMatches: 0,
        unmatchedCount,
        message: 'Cycle is still being prepared.',
      };
    }

    return this.state.finalizePreparedCycle({
      cycleId: cycle.id,
      claimUpdatedAt: cycle.updatedAt,
      adminActorId: options.adminActorId,
      force: options.force,
      createdMatches: totalMatchCount,
      unmatchedCount,
      message: 'Cycle is prepared and waiting for reveal.',
    });
  }

  private async recoverStaleEmptyPreparation(
    cycle: {
      id: string;
      participationDeadline: Date;
      updatedAt: Date;
    },
    options: {
      cycleId: string;
      force?: boolean;
      adminActorId?: string;
    },
    unmatchedCount: number,
  ): Promise<CyclePreparationResult | null> {
    if (!this.isStalePreparationClaim(cycle.updatedAt)) {
      return null;
    }

    const recoveredCycle = await this.prisma.matchCycle.updateMany({
      where: {
        id: cycle.id,
        status: 'PREPARING',
        updatedAt: cycle.updatedAt,
      },
      data: {
        status: 'OPEN',
      },
    });

    if (recoveredCycle.count === 0) {
      return null;
    }

    if (!options.force && cycle.participationDeadline > new Date()) {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'SKIPPED',
        createdMatches: 0,
        unmatchedCount,
        message:
          'Stale empty preparation was reset; participation deadline has not been reached yet.',
      };
    }

    return this.prepareCycle({
      cycleId: cycle.id,
      force: options.force,
      adminActorId: options.adminActorId,
    });
  }

  private isStalePreparationClaim(updatedAt: Date) {
    return (
      Date.now() - updatedAt.getTime() >= PREPARATION_RECOVERY_THRESHOLD_MS
    );
  }
}

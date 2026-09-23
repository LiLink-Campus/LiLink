import { randomUUID } from 'node:crypto';
import { validateQuestionnaireAnswers } from '../questionnaire/questionnaire.service';
import { effectiveMatchingAnswers, hasActiveVip } from '@lilink/shared';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../common/prisma/client';
import { DashboardSnapshotService } from '../../common/dashboard/dashboard-snapshot.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { queueMatchRevealEmails } from '../../common/mail/queue-match-reveal';
import { cancelMatchEmails } from '../../common/mail/match-mail';
import {
  HARD_MATCH_KEYS,
  tryReadHardMatchAnswers,
} from '../questionnaire/hard-match';
import { isWeeklyIntent, type WeeklyIntent } from '@lilink/shared';
import {
  prepareQuestions,
  type CandidatePair,
  type EligibleParticipant,
  type PreparedQuestion,
  type QuestionnaireQuestion,
} from './matching.engine';
import { runMatching } from './matching.executor';

const PREPARATION_RECOVERY_THRESHOLD_MS = 10 * 60 * 1000;
// Cycle automation scheduling. The tick gate (cycles-automation.service) skips
// the periodic poll until nextAutomationAt, so Neon's compute can scale to zero
// during the long waits between a cycle's deadline/reveal boundaries instead of
// being pinned awake by an unconditional every-minute query. When no cycle is
// active we still re-check at this cadence as a safety net in case an admin
// mutation forgot to call invalidateAutomationSchedule().
const AUTOMATION_IDLE_RECHECK_MS = 6 * 60 * 60 * 1000;
// While a cycle is mid-preparation (PREPARING), revisit promptly so cross-tick
// continuation and stale-preparation recovery (PREPARATION_RECOVERY_THRESHOLD_MS)
// keep advancing.
const AUTOMATION_PREPARING_RECHECK_MS = 60 * 1000;
/**
 * Only ACTIVE, non-test users with a stored weekly intent may appear in
 * matching / preview / reveal pools. Every cycle requires an explicit opt-in
 * and a usable intent; previous participation is never carried forward.
 * `isTest: false` keeps demo/seed accounts out of the live pool so they can
 * never be paired with real users, even while ACTIVE and opted in.
 */
const ACTIVE_OPTED_IN_PARTICIPATION_FILTER: Prisma.CycleParticipationWhereInput =
  {
    status: 'OPTED_IN',
    intent: { not: null },
    user: { status: 'ACTIVE', isTest: false, deactivatedAt: null },
  };

export const CYCLE_PROCESSING_INCLUDE = {
  participations: {
    where: ACTIVE_OPTED_IN_PARTICIPATION_FILTER,
    select: {
      intent: true,
      user: {
        select: {
          id: true,
          displayName: true,
          vipActivations: { select: { expiresAt: true, revokedAt: true } },
          questionnaireResponse: {
            select: {
              versionId: true,
              draftAnswers: true,
              answers: true,
              submittedAt: true,
            },
          },
          school: { select: { id: true } },
        },
      },
    },
  },
} satisfies Prisma.MatchCycleInclude;

type RunRevealCycleOptions = {
  force?: boolean;
  cycleId?: string;
  adminActorId?: string;
};

type CyclePreparationResult = {
  ok: true;
  cycleId: string;
  state: 'PREPARED' | 'PENDING' | 'SKIPPED';
  message: string;
  createdMatches: number;
  unmatchedCount: number;
};

type CycleRevealResult = {
  ok: true;
  cycleId: string;
  state: 'REVEALED' | 'SKIPPED';
  message: string;
  createdMatches: number;
};

class PreparationClaimLostError extends Error {
  constructor() {
    super('Cycle state changed before preparation finished.');
  }
}

function buildInsufficientParticipantsMessage(
  optedInCount: number,
  eligibleCount: number,
): string {
  const prefix = 'Not enough complete participants to generate matches.';
  if (optedInCount === 0) {
    return `${prefix} No users are opted in with a weekly intent (FRIEND/DATE/BOTH) for this cycle. At least 2 opted-in users with valid hard-matching questionnaire answers and a weekly intent are required.`;
  }
  if (eligibleCount === 0) {
    return `${prefix} ${optedInCount} user(s) opted in (with a weekly intent), but none have valid hard-matching questionnaire answers (birth date, partner age range, gender / partner genders, looks / partner looks, height / partner height range, and a recognized school).`;
  }
  return `${prefix} Only ${eligibleCount} of ${optedInCount} opted-in user(s) are eligible; at least 2 are required.`;
}

@Injectable()
export class CyclesService {
  private readonly logger = new Logger(CyclesService.name);
  // Cached time the periodic automation tick next needs to run. null means
  // "unknown" (after boot or an out-of-band cycle change) and forces a run.
  private nextAutomationAt: Date | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboardSnapshotService: DashboardSnapshotService,
    private readonly mailService: MailService,
  ) {}

  async runRevealCycle(options: RunRevealCycleOptions = {}) {
    if (!options.cycleId) {
      return this.runAutomationTick();
    }

    let cycle = await this.loadCycleForProcessing(options.cycleId);

    if (!cycle) {
      throw new NotFoundException('Cycle not found.');
    }

    if (options.force && cycle.status !== 'OPEN') {
      if (cycle.status === 'DRAFT') {
        throw new BadRequestException('Draft cycles cannot be executed.');
      }

      await this.resetCycleForForcedRerun(cycle.id);
      cycle = await this.loadCycleForProcessing(cycle.id);

      if (!cycle) {
        throw new NotFoundException('Cycle not found.');
      }
    }

    if (cycle.status === 'OPEN') {
      const preparationResult = await this.prepareCycle({
        cycleId: cycle.id,
        force: options.force,
        adminActorId: options.adminActorId,
      });

      if (preparationResult.state !== 'PREPARED') {
        return preparationResult;
      }

      if (!options.force && cycle.revealAt > new Date()) {
        return preparationResult;
      }

      return this.revealPreparedCycle({
        cycleId: cycle.id,
        force: options.force,
        adminActorId: options.adminActorId,
      });
    }

    if (cycle.status === 'PREPARING') {
      const preparationResult = await this.continuePreparingCycle({
        cycleId: cycle.id,
        force: options.force,
        adminActorId: options.adminActorId,
      });

      if (preparationResult.state !== 'PREPARED') {
        return preparationResult;
      }

      if (!options.force && cycle.revealAt > new Date()) {
        return preparationResult;
      }

      return this.revealPreparedCycle({
        cycleId: cycle.id,
        force: options.force,
        adminActorId: options.adminActorId,
      });
    }

    if (cycle.status === 'REVEAL_READY') {
      return this.revealPreparedCycle({
        cycleId: cycle.id,
        force: options.force,
        adminActorId: options.adminActorId,
      });
    }

    if (cycle.status === 'REVEALED') {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'SKIPPED',
        createdMatches: 0,
        message: 'Cycle has already been revealed.',
      } satisfies CycleRevealResult;
    }

    throw new BadRequestException(
      'Only open or prepared cycles can be executed.',
    );
  }

  /**
   * Whether the periodic automation tick should run now. The cron handler
   * (cycles-automation.service) consults this so it can skip the DB poll while
   * no cycle boundary is due, letting Neon's compute scale to zero between
   * cycles. Returns true when the schedule is unknown (null) so the next tick
   * recomputes it.
   */
  isAutomationDue(now: Date = new Date()): boolean {
    return (
      this.nextAutomationAt === null ||
      now.getTime() >= this.nextAutomationAt.getTime()
    );
  }

  /**
   * Forget the cached automation schedule so the next tick re-evaluates it.
   * Call after any out-of-band change to cycle timing/state (admin create,
   * edit, open, or manual run) so a newly actionable cycle is picked up within
   * one tick interval instead of waiting for the idle safety re-check.
   */
  invalidateAutomationSchedule(): void {
    this.nextAutomationAt = null;
  }

  /**
   * Recompute when the next automation tick needs to run from the earliest
   * upcoming boundary across active cycles. Called by the cron handler after a
   * tick so the idle ticks in between are skipped.
   */
  async refreshAutomationSchedule(now: Date = new Date()): Promise<void> {
    this.nextAutomationAt = await this.computeNextAutomationAt(now);
  }

  private async computeNextAutomationAt(now: Date): Promise<Date> {
    const activeCycles = await this.prisma.matchCycle.findMany({
      where: {
        OR: [
          { status: { in: ['OPEN', 'PREPARING', 'REVEAL_READY'] } },
          { status: 'REVEALED', revealAt: { gt: now } },
        ],
      },
      select: { status: true, participationDeadline: true, revealAt: true },
    });

    if (activeCycles.length === 0) {
      return new Date(now.getTime() + AUTOMATION_IDLE_RECHECK_MS);
    }

    // A PREPARING cycle is mid-flight (or crashed mid-prepare); revisit soon so
    // continuation / stale-preparation recovery keeps progressing.
    if (activeCycles.some((cycle) => cycle.status === 'PREPARING')) {
      return new Date(now.getTime() + AUTOMATION_PREPARING_RECHECK_MS);
    }

    // Early manual reveals still gate the next weekly cycle until revealAt.
    // participationDeadline (OPEN) and revealAt are both
    // non-nullable DateTime in the schema, and the empty / PREPARING cases
    // already returned above, so every remaining cycle yields one boundary.
    const nextBoundary = Math.min(
      ...activeCycles.map((cycle) =>
        (cycle.status === 'OPEN'
          ? cycle.participationDeadline
          : cycle.revealAt
        ).getTime(),
      ),
    );
    // Cap how far ahead we skip so a missed invalidation self-heals; never
    // schedule in the past (a due boundary just means run on the next tick).
    const target = Math.min(
      nextBoundary,
      now.getTime() + AUTOMATION_IDLE_RECHECK_MS,
    );
    return new Date(Math.max(target, now.getTime()));
  }

  async runAutomationTick() {
    const preparedCycleIds: string[] = [];
    const revealedCycleIds: string[] = [];

    const duePreparationCycles = await this.prisma.matchCycle.findMany({
      where: {
        status: 'OPEN',
        participationDeadline: { lte: new Date() },
      },
      orderBy: [{ participationDeadline: 'asc' }, { revealAt: 'asc' }],
      select: { id: true },
    });

    for (const cycle of duePreparationCycles) {
      try {
        const result = await this.prepareCycle({
          cycleId: cycle.id,
        });

        if (result.state === 'PREPARED') {
          preparedCycleIds.push(cycle.id);
        }
      } catch (error) {
        this.logAutomationError('prepare', cycle.id, error);
      }
    }

    const preparingCycles = await this.prisma.matchCycle.findMany({
      where: {
        status: 'PREPARING',
      },
      orderBy: [{ revealAt: 'asc' }, { updatedAt: 'asc' }],
      select: { id: true },
    });

    for (const cycle of preparingCycles) {
      try {
        const result = await this.continuePreparingCycle({
          cycleId: cycle.id,
        });

        if (result.state === 'PREPARED') {
          preparedCycleIds.push(cycle.id);
        }
      } catch (error) {
        this.logAutomationError('prepare', cycle.id, error);
      }
    }

    const dueRevealCycles = await this.prisma.matchCycle.findMany({
      where: {
        status: 'REVEAL_READY',
        revealAt: { lte: new Date() },
      },
      orderBy: { revealAt: 'asc' },
      select: { id: true },
    });

    for (const cycle of dueRevealCycles) {
      try {
        const result = await this.revealPreparedCycle({
          cycleId: cycle.id,
        });

        if (result.state === 'REVEALED') {
          revealedCycleIds.push(cycle.id);
        }
      } catch (error) {
        this.logAutomationError('reveal', cycle.id, error);
      }
    }

    return {
      ok: true,
      preparedCycleIds,
      revealedCycleIds,
    };
  }

  private async prepareCycle(options: {
    cycleId: string;
    force?: boolean;
    adminActorId?: string;
  }): Promise<CyclePreparationResult> {
    const [cycleCandidate, questionnaire] = await Promise.all([
      this.loadCycleForProcessing(options.cycleId),
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
      const participants = this.toEligibleParticipants(
        cycle.participations,
        questionnaire,
        (await this.prisma.school.findMany({ select: { id: true } })).map(
          (school) => school.id,
        ),
      );
      const questionnairesByVersionId =
        await this.loadQuestionnairesByVersionId(participants, questionnaire);

      let selectedPairs: CandidatePair[] = [];
      let preparationMessage = 'Cycle is prepared and waiting for reveal.';

      if (participants.length < 2) {
        preparationMessage = `${buildInsufficientParticipantsMessage(
          optedInCount,
          participants.length,
        )} The cycle has been prepared and will reveal zero matches.`;
      } else {
        const calculatedPairs = await this.calculatePairs(
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

      return this.finalizePreparedCycle({
        cycleId: cycle.id,
        claimUpdatedAt,
        adminActorId: options.adminActorId,
        force: options.force,
        createdMatches: selectedPairs.length,
        unmatchedCount,
        message: preparationMessage,
      });
    } catch (error) {
      await this.revertPreparationClaimIfEmpty(cycle.id, claimUpdatedAt);

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

  private async continuePreparingCycle(options: {
    cycleId: string;
    force?: boolean;
    adminActorId?: string;
  }): Promise<CyclePreparationResult> {
    const cycle = await this.loadCycleForProcessing(options.cycleId);

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

    return this.finalizePreparedCycle({
      cycleId: cycle.id,
      claimUpdatedAt: cycle.updatedAt,
      adminActorId: options.adminActorId,
      force: options.force,
      createdMatches: totalMatchCount,
      unmatchedCount,
      message: 'Cycle is prepared and waiting for reveal.',
    });
  }

  private async revealPreparedCycle(options: {
    cycleId: string;
    force?: boolean;
    adminActorId?: string;
  }): Promise<CycleRevealResult> {
    const cycle = await this.prisma.matchCycle.findUnique({
      where: { id: options.cycleId },
      select: {
        id: true,
        revealAt: true,
        status: true,
      },
    });

    if (!cycle) {
      throw new NotFoundException('Cycle not found.');
    }

    if (cycle.status === 'PREPARING') {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'SKIPPED',
        createdMatches: 0,
        message: 'Cycle is still being prepared.',
      };
    }

    if (cycle.status === 'OPEN') {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'SKIPPED',
        createdMatches: 0,
        message: 'Cycle has not been prepared yet.',
      };
    }

    if (cycle.status === 'REVEALED') {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'SKIPPED',
        createdMatches: 0,
        message: 'Cycle has already been revealed.',
      };
    }

    if (cycle.status !== 'REVEAL_READY') {
      throw new BadRequestException('Only prepared cycles can be revealed.');
    }

    if (!options.force && cycle.revealAt > new Date()) {
      throw new BadRequestException('Reveal time has not been reached yet.');
    }

    const revealedAt = new Date();
    let emailDedupeKeys: string[] = [];
    const transactionStarted = performance.now();
    const revealedMatchCount = await this.prisma.$transaction(
      async (tx) => {
        const claimedCycle = await tx.matchCycle.updateMany({
          where: {
            id: cycle.id,
            status: 'REVEAL_READY',
          },
          data: {
            status: 'REVEALED',
          },
        });

        if (claimedCycle.count === 0) {
          return null;
        }

        const revealedMatches = await tx.match.updateMany({
          where: {
            cycleId: cycle.id,
            revealedAt: null,
          },
          data: {
            revealedAt,
          },
        });

        if (revealedMatches.count > 0) {
          emailDedupeKeys = await queueMatchRevealEmails(
            tx,
            cycle.id,
            revealedAt,
            this.mailService,
          );
        }

        await tx.auditLog.create({
          data: {
            adminActorId: options.adminActorId,
            action: 'cycle.revealed',
            metadata: {
              cycleId: cycle.id,
              createdMatches: revealedMatches.count,
              forced: options.force ?? false,
            },
          },
        });

        return revealedMatches.count;
      },
      { timeout: 30_000 },
    );
    const transactionMs = Math.round(performance.now() - transactionStarted);

    if (revealedMatchCount == null) {
      return {
        ok: true,
        cycleId: cycle.id,
        state: 'SKIPPED',
        createdMatches: 0,
        message: 'Cycle is already being revealed.',
      };
    }

    // Rebuild dashboard snapshots outside the reveal transaction so the cycle
    // status / match updates commit (and release their row locks) quickly
    // instead of being held for the whole per-participation rebuild. A failure
    // here is recoverable: dashboard reads repair coverage lazily via
    // ensureUserSnapshotCoverage, and admins can re-trigger a cycle sync.
    const snapshotsStarted = performance.now();
    let snapshotsCompleted = false;
    try {
      await this.dashboardSnapshotService.syncCycleSnapshots(cycle.id);
      snapshotsCompleted = true;
    } catch (error) {
      this.logger.error(
        `Cycle ${cycle.id} revealed but dashboard snapshot rebuild failed; relying on lazy coverage.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
    this.logger.log({
      kind: 'cycle-reveal-performance',
      cycleId: cycle.id,
      transactionMs,
      snapshotsMs: Math.round(performance.now() - snapshotsStarted),
      snapshotsCompleted,
      matches: revealedMatchCount,
      queuedEmails: emailDedupeKeys.length,
    });

    if (emailDedupeKeys.length > 0) {
      void this.mailService
        .flushQueuedEmails({ dedupeKeys: emailDedupeKeys })
        .catch((error: unknown) => {
          this.logger.error(
            'Reveal email delivery will retry from the outbox.',
            error instanceof Error ? error.message : String(error),
          );
        });
    }

    return {
      ok: true,
      cycleId: cycle.id,
      state: 'REVEALED',
      createdMatches: revealedMatchCount,
      message:
        revealedMatchCount > 0
          ? `Cycle revealed ${revealedMatchCount} prepared match(es).`
          : 'Cycle revealed with no matches.',
    };
  }

  async previewCycle(cycleId: string) {
    const [cycle, questionnaire] = await Promise.all([
      this.prisma.matchCycle.findUnique({
        where: { id: cycleId },
        include: {
          participations: {
            where: ACTIVE_OPTED_IN_PARTICIPATION_FILTER,
            select: {
              intent: true,
              user: {
                select: {
                  id: true,
                  displayName: true,
                  vipActivations: {
                    select: { expiresAt: true, revokedAt: true },
                  },
                  questionnaireResponse: {
                    select: {
                      versionId: true,
                      draftAnswers: true,
                      answers: true,
                      submittedAt: true,
                    },
                  },
                  school: { select: { id: true } },
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

    const participants = this.toEligibleParticipants(
      cycle.participations,
      questionnaire,
      (await this.prisma.school.findMany({ select: { id: true } })).map(
        (school) => school.id,
      ),
    );
    const questionnairesByVersionId = await this.loadQuestionnairesByVersionId(
      participants,
      questionnaire,
    );
    const { candidates, candidateCount, selectedPairs } =
      await this.calculatePairs(
        participants,
        questionnaire.questions,
        cycle.revealAt,
        cycle.id,
        questionnairesByVersionId,
      );
    const matchedUserIds = new Set(
      selectedPairs.flatMap((pair) => [pair.left.id, pair.right.id]),
    );

    return {
      cycleId,
      totalCandidateCount: candidateCount,
      candidates: candidates.slice(0, 20).map((pair) => ({
        leftUserId: pair.left.id,
        rightUserId: pair.right.id,
        leftDisplayName: pair.left.displayName,
        rightDisplayName: pair.right.displayName,
        score: pair.score,
      })),
      suggestedPairs: selectedPairs.map((pair) => ({
        leftUserId: pair.left.id,
        rightUserId: pair.right.id,
        leftDisplayName: pair.left.displayName,
        rightDisplayName: pair.right.displayName,
        score: pair.score,
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

  private async loadUnmatchedStreaks(
    participantIds: string[],
    beforeRevealAt: Date,
    currentCycleId?: string,
  ) {
    if (participantIds.length === 0) {
      return new Map<string, number>();
    }

    const participations = await this.prisma.cycleParticipation.findMany({
      where: {
        userId: { in: participantIds },
        status: 'OPTED_IN',
        intent: { not: null },
        ...(currentCycleId ? { cycleId: { not: currentCycleId } } : {}),
        cycle: {
          status: 'REVEALED',
          revealAt: { lt: beforeRevealAt },
        },
      },
      select: {
        userId: true,
        cycleId: true,
        updatedAt: true,
        cycle: {
          select: {
            revealAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: [
        { userId: 'asc' },
        { cycle: { revealAt: 'desc' } },
        { cycle: { createdAt: 'desc' } },
        { updatedAt: 'desc' },
      ],
    });
    const cycleIds = Array.from(
      new Set(participations.map((participation) => participation.cycleId)),
    );
    const matchedParticipations =
      cycleIds.length === 0
        ? []
        : await this.prisma.matchParticipant.findMany({
            where: {
              userId: { in: participantIds },
              cycleId: { in: cycleIds },
            },
            select: {
              userId: true,
              cycleId: true,
            },
          });
    const matchedParticipationKeys = new Set(
      matchedParticipations.map(
        (participant) => `${participant.userId}::${participant.cycleId}`,
      ),
    );
    const participationsByUserId = new Map<string, typeof participations>();

    for (const participation of participations) {
      const userParticipations =
        participationsByUserId.get(participation.userId) ?? [];
      userParticipations.push(participation);
      participationsByUserId.set(participation.userId, userParticipations);
    }

    return new Map(
      participantIds.map((participantId) => {
        const userParticipations =
          participationsByUserId.get(participantId) ?? [];
        let streak = 0;

        for (const participation of userParticipations) {
          const participationKey = `${participation.userId}::${participation.cycleId}`;
          if (matchedParticipationKeys.has(participationKey)) {
            break;
          }

          streak += 1;
        }

        return [participantId, streak];
      }),
    );
  }

  /**
   * Returns the subset of participantIds whose current participation is their
   * very first opt-in cycle — i.e. they have no earlier REVEALED opt-in. Uses
   * the same historical window as loadUnmatchedStreaks (not optedInAt, which
   * a per-cycle timestamp alone cannot identify the first opt-in).
   */
  private async loadFirstCycleParticipantIds(
    participantIds: string[],
    beforeRevealAt: Date,
    currentCycleId?: string,
  ): Promise<Set<string>> {
    if (participantIds.length === 0) {
      return new Set<string>();
    }

    const priorParticipations = await this.prisma.cycleParticipation.findMany({
      where: {
        userId: { in: participantIds },
        status: 'OPTED_IN',
        intent: { not: null },
        ...(currentCycleId ? { cycleId: { not: currentCycleId } } : {}),
        cycle: {
          status: 'REVEALED',
          revealAt: { lt: beforeRevealAt },
        },
      },
      select: { userId: true },
      distinct: ['userId'],
    });

    const returningUserIds = new Set(
      priorParticipations.map((participation) => participation.userId),
    );

    return new Set(participantIds.filter((id) => !returningUserIds.has(id)));
  }

  private loadCycleForProcessing(cycleId: string) {
    return this.prisma.matchCycle.findUnique({
      where: { id: cycleId },
      include: CYCLE_PROCESSING_INCLUDE,
    });
  }

  private toEligibleParticipants(
    participations: Array<{
      intent: WeeklyIntent | null;
      user: {
        id: string;
        displayName: string | null;
        school?: { id: string } | null;
        vipActivations?: Array<{
          expiresAt: Date | null;
          revokedAt: Date | null;
        }>;
        questionnaireResponse: {
          versionId?: string | null;
          draftAnswers?: Prisma.JsonValue;
          answers: Prisma.JsonValue;
          submittedAt: Date | null;
        } | null;
      };
    }>,
    questionnaire: { id: string; questions: QuestionnaireQuestion[] },
    allowedSchoolIds: string[],
  ): EligibleParticipant[] {
    return participations
      .map((entry): EligibleParticipant | null => {
        const { user } = entry;
        if (
          !user.questionnaireResponse ||
          user.questionnaireResponse.submittedAt == null ||
          user.questionnaireResponse.versionId !== questionnaire.id ||
          user.questionnaireResponse.draftAnswers != null
        ) {
          return null;
        }

        // Defense in depth — the SQL filter already excludes intent=null,
        // but if anything ever bypasses it (eg. raw queries) we still drop
        // the row instead of silently treating it as compatible with all.
        if (!isWeeklyIntent(entry.intent)) {
          return null;
        }

        const answers: Record<string, unknown> = {
          ...((user.questionnaireResponse.answers ?? {}) as Record<
            string,
            unknown
          >),
          [HARD_MATCH_KEYS.school]: user.school?.id ?? '',
        };
        try {
          validateQuestionnaireAnswers(
            questionnaire.questions,
            answers,
            allowedSchoolIds,
          );
        } catch (error) {
          if (error instanceof BadRequestException) return null;
          throw error;
        }
        const vipActive = hasActiveVip(user.vipActivations);
        const hardMatchAnswers = tryReadHardMatchAnswers(
          effectiveMatchingAnswers(answers, vipActive),
        );

        if (!hardMatchAnswers) {
          return null;
        }

        return {
          id: user.id,
          displayName: user.displayName,
          questionnaireVersionId: user.questionnaireResponse.versionId ?? null,
          vipActive,
          hardMatchAnswers,
          answers,
          intent: entry.intent,
        };
      })
      .filter(
        (participant): participant is EligibleParticipant =>
          participant !== null,
      );
  }

  private async loadQuestionnairesByVersionId(
    participants: EligibleParticipant[],
    currentQuestionnaire?: {
      id: string;
      questions: QuestionnaireQuestion[];
    } | null,
  ) {
    const versionIds = [
      ...new Set(
        participants
          .map((participant) => participant.questionnaireVersionId)
          .filter((versionId): versionId is string => Boolean(versionId)),
      ),
    ];
    const questionnairesByVersionId = new Map<string, PreparedQuestion[]>();

    if (currentQuestionnaire) {
      questionnairesByVersionId.set(
        currentQuestionnaire.id,
        prepareQuestions(currentQuestionnaire.questions),
      );
    }

    const missingVersionIds = versionIds.filter(
      (versionId) => !questionnairesByVersionId.has(versionId),
    );

    if (missingVersionIds.length === 0) {
      return questionnairesByVersionId;
    }

    const questionnaireVersions =
      await this.prisma.questionnaireVersion.findMany({
        where: {
          id: { in: missingVersionIds },
        },
        include: {
          questions: {
            orderBy: { order: 'asc' },
          },
        },
      });

    for (const questionnaireVersion of questionnaireVersions) {
      questionnairesByVersionId.set(
        questionnaireVersion.id,
        prepareQuestions(questionnaireVersion.questions),
      );
    }

    return questionnairesByVersionId;
  }

  private async calculatePairs(
    participants: EligibleParticipant[],
    questions: QuestionnaireQuestion[],
    revealAt: Date,
    currentCycleId?: string,
    questionnairesByVersionId = new Map<string, PreparedQuestion[]>(),
  ) {
    const participantIds = participants.map((participant) => participant.id);
    if (participants.length < 2) {
      return {
        candidateCount: 0,
        candidates: [],
        selectedPairs: [],
      };
    }

    const [
      blocks,
      historicalPairKeys,
      unmatchedStreaks,
      firstCycleParticipantIds,
    ] = await Promise.all([
      this.prisma.block.findMany({
        where: {
          OR: [
            { blockerId: { in: participantIds } },
            { blockedId: { in: participantIds } },
          ],
        },
      }),
      this.loadHistoricalPairKeys(participantIds, currentCycleId),
      this.loadUnmatchedStreaks(participantIds, revealAt, currentCycleId),
      this.loadFirstCycleParticipantIds(
        participantIds,
        revealAt,
        currentCycleId,
      ),
    ]);
    const blockedPairKeys = new Set(
      blocks.map((block) =>
        this.createPairKey(block.blockerId, block.blockedId),
      ),
    );

    const result = await runMatching({
      participants,
      questions,
      revealAt,
      questionnairesByVersionId,
      blockedPairKeys,
      historicalPairKeys,
      unmatchedStreaks,
      firstCycleParticipantIds,
    });
    this.logger.log(
      `Cycle ${currentCycleId ?? 'preview'} matching considered ${participants.length} participant(s), kept ${result.candidateCount} candidate pair(s), selected ${result.selectedPairs.length} pair(s).`,
    );
    return result;
  }

  private async resetCycleForForcedRerun(cycleId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "MatchCycle" WHERE "id" = ${cycleId} FOR UPDATE`;
      const matches = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "Match" WHERE "cycleId" = ${cycleId}
        ORDER BY "id" FOR UPDATE
      `;
      await cancelMatchEmails(
        tx,
        matches.map(({ id }) => id),
        'Match reset before delivery.',
      );
      await tx.match.deleteMany({
        where: { cycleId },
      });
      await tx.userCycleDashboardSnapshot.deleteMany({
        where: { cycleId },
      });
      await tx.matchCycle.update({
        where: { id: cycleId },
        data: { status: 'OPEN' },
      });
    });
  }

  private async revertPreparationClaimIfEmpty(
    cycleId: string,
    claimUpdatedAt?: Date,
  ) {
    await this.prisma.matchCycle.updateMany({
      where: {
        id: cycleId,
        status: 'PREPARING',
        matches: { none: {} },
        ...(claimUpdatedAt ? { updatedAt: claimUpdatedAt } : {}),
      },
      data: {
        status: 'OPEN',
      },
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

  private async finalizePreparedCycle(options: {
    cycleId: string;
    claimUpdatedAt?: Date;
    adminActorId?: string;
    force?: boolean;
    createdMatches: number;
    unmatchedCount: number;
    message: string;
  }): Promise<CyclePreparationResult> {
    const finalized = await this.prisma.$transaction(async (tx) => {
      const claimedCycle = await tx.matchCycle.updateMany({
        where: {
          id: options.cycleId,
          status: 'PREPARING',
          ...(options.claimUpdatedAt
            ? { updatedAt: options.claimUpdatedAt }
            : {}),
        },
        data: {
          status: 'REVEAL_READY',
        },
      });

      if (claimedCycle.count === 0) {
        return false;
      }

      await tx.auditLog.create({
        data: {
          adminActorId: options.adminActorId,
          action: 'cycle.prepared',
          metadata: {
            cycleId: options.cycleId,
            createdMatches: options.createdMatches,
            unmatchedCount: options.unmatchedCount,
            forced: options.force ?? false,
            message: options.message,
          },
        },
      });

      return true;
    });

    return {
      ok: true,
      cycleId: options.cycleId,
      state: 'PREPARED',
      createdMatches: options.createdMatches,
      unmatchedCount: options.unmatchedCount,
      message: finalized
        ? options.message
        : 'Cycle is already prepared and waiting for reveal.',
    };
  }

  private logAutomationError(
    stage: 'prepare' | 'reveal',
    cycleId: string,
    error: unknown,
  ) {
    const message =
      error instanceof Error ? error.message : 'Unknown automation error.';
    this.logger.error(
      `Cycle automation ${stage} failed for cycle ${cycleId}. ${message}`,
    );
  }
}

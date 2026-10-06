import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PublicService } from '../public/public.service';
import {
  AUTOMATION_IDLE_RECHECK_MS,
  AUTOMATION_PREPARING_RECHECK_MS,
  RunRevealCycleOptions,
  CycleRevealResult,
} from './cycle-processing';
import { CycleMatchingInputService } from './cycle-matching-input.service';
import { CyclePreparationService } from './cycle-preparation.service';
import { CycleRevealService } from './cycle-reveal.service';
@Injectable()
export class CyclesService {
  private readonly logger = new Logger(CyclesService.name);
  private nextAutomationAt: Date | null = null;
  constructor(
    private readonly prisma: PrismaService,
    private readonly input: CycleMatchingInputService,
    private readonly preparation: CyclePreparationService,
    private readonly reveal: CycleRevealService,
    private readonly publicService: PublicService,
  ) {}
  async runRevealCycle(options: RunRevealCycleOptions = {}) {
    if (!options.cycleId) {
      return this.runAutomationTick();
    }

    let cycle = await this.input.loadCycleForProcessing(options.cycleId);

    if (!cycle) {
      throw new NotFoundException('Cycle not found.');
    }

    if (options.force && cycle.status !== 'OPEN') {
      if (cycle.status === 'DRAFT') {
        throw new BadRequestException('Draft cycles cannot be executed.');
      }

      await this.reveal.resetCycleForForcedRerun(cycle.id);
      cycle = await this.input.loadCycleForProcessing(cycle.id);

      if (!cycle) {
        throw new NotFoundException('Cycle not found.');
      }
    }

    if (cycle.status === 'OPEN') {
      const preparationResult = await this.preparation.prepareCycle({
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

      return this.reveal.revealPreparedCycle({
        cycleId: cycle.id,
        force: options.force,
        adminActorId: options.adminActorId,
      });
    }

    if (cycle.status === 'PREPARING') {
      const preparationResult = await this.preparation.continuePreparingCycle({
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

      return this.reveal.revealPreparedCycle({
        cycleId: cycle.id,
        force: options.force,
        adminActorId: options.adminActorId,
      });
    }

    if (cycle.status === 'REVEAL_READY') {
      return this.reveal.revealPreparedCycle({
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

  isAutomationDue(now: Date = new Date()): boolean {
    return (
      this.nextAutomationAt === null ||
      now.getTime() >= this.nextAutomationAt.getTime()
    );
  }

  invalidateAutomationSchedule(): void {
    this.nextAutomationAt = null;
    this.publicService.invalidateLandingCache();
  }

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
        const result = await this.preparation.prepareCycle({
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
        const result = await this.preparation.continuePreparingCycle({
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
        const result = await this.reveal.revealPreparedCycle({
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

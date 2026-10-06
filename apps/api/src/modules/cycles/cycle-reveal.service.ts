import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DashboardSnapshotService } from '../../common/dashboard/dashboard-snapshot.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { MailService } from '../../common/mail/mail.service';
import { queueMatchRevealEmails } from '../../common/mail/queue-match-reveal';
import { cancelMatchEmails } from '../../common/mail/match-mail';
import { PublicService } from '../public/public.service';
import { CycleRevealResult } from './cycle-processing';

@Injectable()
export class CycleRevealService {
  private readonly logger = new Logger(CycleRevealService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboardSnapshotService: DashboardSnapshotService,
    private readonly mailService: MailService,
    private readonly publicService: PublicService,
  ) {}
  async revealPreparedCycle(options: {
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

    this.publicService.invalidateLandingCache();

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

  async resetCycleForForcedRerun(cycleId: string) {
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
    this.publicService.invalidateLandingCache();
  }
}

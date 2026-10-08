import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { PublicCacheInvalidation } from '../../common/prisma/client';
import { env } from '../../config/env';
import { PublicCacheInvalidationService } from './public-cache-invalidation.service';
import {
  readHomePublication,
  type PublicationProbe,
} from './public-cache-publication';
import { PUBLIC_CACHE_DATABASE } from './public-cache-database';
import { PublicCacheSchedule } from './public-cache-schedule';
import { PublicCacheSignals } from './public-cache-signals';

type Outcome = 'verified' | 'mismatch' | 'unsupported' | 'skipped' | 'failed';
type InternalOutcome =
  | Outcome
  | 'gate-deferred'
  | 'lease-held'
  | 'superseded'
  | 'exhausted'
  | 'stopped'
  | 'awaiting-notification';
type Result = { value: InternalOutcome; nextAt?: number };

@Injectable()
export class PublicCachePublicationService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(PublicCachePublicationService.name);
  private readonly schedule = new PublicCacheSchedule<InternalOutcome>(
    PublicCachePublicationService.name,
    () =>
      !env.RELEASE_MAINTENANCE &&
      env.BACKGROUND_JOBS_ENABLED &&
      Boolean(env.PUBLIC_CACHE_REVALIDATION_URL) &&
      Boolean(env.PUBLIC_CACHE_REVALIDATION_SECRET),
    () => this.scan(),
  );
  private readonly unsubscribe: () => void;

  constructor(
    @Inject(PUBLIC_CACHE_DATABASE) private readonly prisma: PrismaService,
    private readonly invalidation: PublicCacheInvalidationService,
    signals: PublicCacheSignals,
  ) {
    this.unsubscribe = signals.onAcknowledged(() => this.schedule.wake());
  }

  onApplicationBootstrap() {
    this.schedule.wake();
  }

  onModuleDestroy() {
    this.unsubscribe();
    this.schedule.stop();
  }

  getSchedulingState() {
    return this.schedule.health();
  }

  async reconcile() {
    await this.schedule.run();
  }

  // The signed endpoint retains its public outcomes and cannot bypass recovery,
  // database ownership, or the persistent five-minute acquisition gate.
  async verify(): Promise<Outcome> {
    if (!this.schedule.active()) return 'skipped';
    const outcome = await this.schedule.run(true);
    if (!outcome)
      return this.schedule.health().state === 'healthy' ? 'skipped' : 'failed';
    switch (outcome) {
      case 'verified':
      case 'mismatch':
      case 'unsupported':
      case 'failed':
        return outcome;
      default:
        return 'skipped';
    }
  }

  private read() {
    return this.prisma.publicCacheInvalidation.findUnique({
      where: { scope: 'home' },
    });
  }

  private exhausted(row: PublicCacheInvalidation) {
    return (
      row.verificationFailures >= 6 &&
      row.verificationTargetHash === row.deliveredHash
    );
  }

  private eligibleAt(row: PublicCacheInvalidation) {
    return Math.max(
      row.lastVerificationAt ? row.lastVerificationAt.getTime() + 300_000 : 0,
      row.verificationLeaseUntil?.getTime() ?? 0,
    );
  }

  private async deferred(
    value: InternalOutcome,
    competition = false,
  ): Promise<Result> {
    if (!this.schedule.active()) return { value: 'stopped' };
    const current = await this.read();
    if (!current) return { value: 'awaiting-notification' };
    if (this.exhausted(current)) return { value };
    const complete =
      current.verificationCompletedRevision === current.acknowledgedRevision &&
      current.verificationOutcome !== null;
    return {
      value,
      nextAt: complete
        ? undefined
        : Math.max(
            Date.now() + (competition ? 1000 : 25),
            this.eligibleAt(current),
          ),
    };
  }

  private async scan(): Promise<Result> {
    const row = await this.read();
    if (!this.schedule.active()) return { value: 'stopped' };
    if (!row) return { value: 'awaiting-notification' };
    if (this.exhausted(row)) return { value: 'exhausted' };
    // No notification target exists yet. The sender's acknowledgment will wake
    // this service; startup/fallback still recover a lost in-process signal.
    if (!row.deliveredHash && row.acknowledgedRevision < row.revision)
      return { value: 'awaiting-notification' };
    const eligible = this.eligibleAt(row);
    if (eligible > Date.now())
      return {
        value:
          (row.verificationLeaseUntil?.getTime() ?? 0) >= eligible
            ? 'lease-held'
            : 'gate-deferred',
        nextAt:
          row.verificationCompletedRevision === row.acknowledgedRevision &&
          row.verificationOutcome
            ? undefined
            : eligible,
      };
    const token = randomUUID();
    const claimed = await this.prisma.$executeRaw`
      UPDATE "PublicCacheInvalidation"
      SET "verificationLeaseToken" = ${token}, "verificationLeaseUntil" = NOW() + INTERVAL '30 seconds',
        "lastVerificationAt" = NOW(),
        "verificationFailures" = CASE WHEN "verificationTargetHash" IS DISTINCT FROM "deliveredHash"
          THEN 1 ELSE "verificationFailures" + 1 END,
        "verificationTargetHash" = "deliveredHash"
      WHERE "scope" = 'home' AND "revision" = ${row.revision}
        AND "acknowledgedRevision" = ${row.acknowledgedRevision}
        AND "deliveredHash" IS NOT DISTINCT FROM ${row.deliveredHash}
        AND ("verificationLeaseUntil" IS NULL OR "verificationLeaseUntil" <= NOW())
        AND ("lastVerificationAt" IS NULL OR "lastVerificationAt" <= NOW() - INTERVAL '5 minutes')
        AND ("verificationFailures" < 6 OR "verificationTargetHash" IS DISTINCT FROM "deliveredHash")
    `;
    if (claimed !== 1) return this.deferred('superseded', true);
    if (!this.schedule.active()) return { value: 'stopped' };
    const hash =
      row.deliveredHash ?? (await this.invalidation.snapshotHash('home'));
    let probe: PublicationProbe | undefined;
    try {
      probe = await readHomePublication();
    } catch {
      /* Only HTTP failure consumes the business retry path. */
    }
    if (!this.schedule.active()) return { value: 'stopped' };
    const value: Outcome = !probe
      ? 'failed'
      : probe.kind === 'unsupported'
        ? 'unsupported'
        : probe.hash === hash
          ? 'verified'
          : 'mismatch';
    const complete = value === 'verified' || value === 'unsupported';
    const valid = await this.prisma.publicCacheInvalidation.updateMany({
      where: {
        scope: 'home',
        revision: row.revision,
        acknowledgedRevision: row.acknowledgedRevision,
        deliveredHash: row.deliveredHash,
        verificationLeaseToken: token,
        verificationLeaseUntil: { gt: new Date() },
      },
      data: {
        lastVerificationAt: new Date(),
        ...(probe
          ? { verifiedHash: probe.kind === 'published' ? probe.hash : null }
          : {}),
        ...(complete
          ? {
              verificationFailures: 0,
              verificationCompletedRevision: row.acknowledgedRevision,
              verificationOutcome: value,
            }
          : { verificationCompletedRevision: null, verificationOutcome: null }),
      },
    });
    if (valid.count === 1 && value === 'mismatch')
      await this.repair(row, token);
    if (!this.schedule.active()) return { value: 'stopped' };
    // A superseded result is a normal deferral. Refund only our still-owned
    // attempt for the same content; never touch a newer owner's budget.
    await this.prisma.$executeRaw`
      UPDATE "PublicCacheInvalidation"
      SET "verificationFailures" = CASE WHEN ${valid.count} = 0
        AND "verificationLeaseUntil" > NOW()
        AND "verificationTargetHash" IS NOT DISTINCT FROM ${row.deliveredHash}
        AND "deliveredHash" IS NOT DISTINCT FROM ${row.deliveredHash}
        THEN GREATEST(0, "verificationFailures" - 1) ELSE "verificationFailures" END,
        "verificationLeaseToken" = NULL, "verificationLeaseUntil" = NULL
      WHERE "scope" = 'home' AND "verificationLeaseToken" = ${token}
    `;
    if (valid.count !== 1) return this.deferred('superseded', true);
    this.logger.log(
      `Public cache publication checked: revision=${row.acknowledgedRevision}, outcome=${value}.`,
    );
    // A concurrent notification after completion must still be scheduled; its
    // wake may already be coalesced by the current executor.
    return this.deferred(value);
  }

  private async repair(row: PublicCacheInvalidation, token: string) {
    if (!this.schedule.active()) return;
    const repaired = await this.prisma.$executeRaw`
      UPDATE "PublicCacheInvalidation"
      SET "revision" = "revision" + 1, "dueAt" = NOW(), "urgent" = true
      WHERE "scope" = 'home' AND "revision" = ${row.revision}
        AND "acknowledgedRevision" = ${row.acknowledgedRevision} AND "acknowledgedRevision" >= "revision"
        AND "exhaustedAt" IS NULL AND "deliveredHash" IS NOT DISTINCT FROM ${row.deliveredHash}
        AND "verificationLeaseToken" = ${token} AND "verificationLeaseUntil" > NOW()
        AND ("leaseUntil" IS NULL OR "leaseUntil" <= NOW())
        AND ("lastClaimedAt" IS NULL OR "lastClaimedAt" <= NOW() - INTERVAL '30 minutes')
    `;
    if (repaired === 1) this.invalidation.wake();
    else {
      await this.prisma.$executeRaw`
        UPDATE "PublicCacheInvalidation" SET "verificationFailures" = GREATEST(0, "verificationFailures" - 1)
        WHERE "scope" = 'home' AND "revision" = ${row.revision}
          AND "acknowledgedRevision" = ${row.acknowledgedRevision}
          AND "verificationLeaseToken" = ${token} AND "verificationLeaseUntil" > NOW()
          AND ("acknowledgedRevision" < "revision" OR "lastClaimedAt" > NOW() - INTERVAL '30 minutes')
      `;
    }
  }
}

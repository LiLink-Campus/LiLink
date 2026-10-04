import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { env } from '../../config/env';
import { PublicCacheInvalidationService } from './public-cache-invalidation.service';
import { readHomePublication } from './public-cache-publication';

type Outcome = 'verified' | 'mismatch' | 'unsupported' | 'skipped' | 'failed';

@Injectable()
export class PublicCachePublicationService {
  private readonly logger = new Logger(PublicCachePublicationService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly invalidation: PublicCacheInvalidationService,
  ) {}

  @Cron('* * * * *', {
    name: 'public-cache-publication',
    waitForCompletion: true,
  })
  async reconcile() {
    await this.verify();
  }

  async verify(): Promise<Outcome> {
    try {
      return await this.verifyOwned();
    } catch {
      // Acquisition/cleanup failures must not make Cron print raw DB errors.
      this.logger.warn(
        'Public cache publication persistence unavailable; hourly recovery remains active.',
      );
      return 'failed';
    }
  }

  private async verifyOwned(): Promise<Outcome> {
    if (
      env.RELEASE_MAINTENANCE ||
      !env.BACKGROUND_JOBS_ENABLED ||
      !env.PUBLIC_CACHE_REVALIDATION_URL ||
      !env.PUBLIC_CACHE_REVALIDATION_SECRET
    )
      return 'skipped';
    const token = randomUUID();
    const rows = await this.prisma.$queryRaw<
      Array<{
        revision: bigint;
        acknowledgedRevision: bigint;
        deliveredHash: string | null;
      }>
    >`
      UPDATE "PublicCacheInvalidation"
      SET "verificationLeaseToken" = ${token}, "verificationLeaseUntil" = NOW() + INTERVAL '30 seconds',
        "lastVerificationAt" = NOW(),
        "verificationFailures" = CASE WHEN "verificationTargetHash" IS DISTINCT FROM "deliveredHash"
          THEN 1 ELSE "verificationFailures" + 1 END,
        "verificationTargetHash" = "deliveredHash"
      WHERE "scope" = 'home'
        AND ("verificationLeaseUntil" IS NULL OR "verificationLeaseUntil" <= NOW())
        AND ("lastVerificationAt" IS NULL OR "lastVerificationAt" <= NOW() - INTERVAL '5 minutes')
        AND ("verificationFailures" < 6 OR "verificationTargetHash" IS DISTINCT FROM "deliveredHash")
      RETURNING "revision", "acknowledgedRevision", "deliveredHash"
    `;
    if (rows.length !== 1) return 'skipped';
    const revision = rows[0].revision;
    try {
      // The transactional queue already tracks source changes. Idle checks use
      // its intended publication, avoiding repeated aggregate queries/cache clears.
      const hash =
        rows[0].deliveredHash ?? (await this.invalidation.snapshotHash('home'));
      const probe = await readHomePublication();
      const valid = await this.prisma.publicCacheInvalidation.updateMany({
        where: {
          scope: 'home',
          revision,
          acknowledgedRevision: rows[0].acknowledgedRevision,
          deliveredHash: rows[0].deliveredHash,
          verificationLeaseToken: token,
          verificationLeaseUntil: { gt: new Date() },
        },
        data: {
          verifiedHash: probe.kind === 'published' ? probe.hash : null,
          lastVerificationAt: new Date(),
          ...(probe.kind === 'unsupported' || probe.hash === hash
            ? { verificationFailures: 0 }
            : {}),
        },
      });
      if (valid.count !== 1) return 'skipped';
      if (probe.kind === 'unsupported') return 'unsupported';
      if (probe.hash === hash) return 'verified';
      // Acknowledgment can precede a lost tag side effect. Mint a repair only
      // after the same persistent receiver window, retaining exhausted work.
      const repaired = await this.prisma.$executeRaw`
        UPDATE "PublicCacheInvalidation"
        SET "revision" = "revision" + 1, "dueAt" = NOW(), "urgent" = true
        WHERE "scope" = 'home' AND "revision" = ${revision}
          AND "acknowledgedRevision" >= "revision" AND "exhaustedAt" IS NULL
          AND "deliveredHash" IS NOT DISTINCT FROM ${rows[0].deliveredHash}
          AND "verificationLeaseToken" = ${token} AND "verificationLeaseUntil" > NOW()
          AND ("leaseUntil" IS NULL OR "leaseUntil" <= NOW())
          AND ("lastClaimedAt" IS NULL OR "lastClaimedAt" <= NOW() - INTERVAL '30 minutes')
      `;
      if (repaired === 1) this.invalidation.wake();
      else {
        // Pending business work and a closed receiver window are normal
        // deferrals, not failures. A repair revision never resets this budget.
        await this.prisma.$executeRaw`
          UPDATE "PublicCacheInvalidation" SET "verificationFailures" = GREATEST(0, "verificationFailures" - 1)
          WHERE "scope" = 'home' AND "revision" = ${revision}
            AND "verificationLeaseToken" = ${token} AND "verificationLeaseUntil" > NOW()
            AND ("acknowledgedRevision" < "revision"
              OR "lastClaimedAt" > NOW() - INTERVAL '30 minutes')
        `;
      }
      return 'mismatch';
    } catch {
      await this.prisma.publicCacheInvalidation.updateMany({
        where: {
          scope: 'home',
          revision,
          verificationLeaseToken: token,
          verificationLeaseUntil: { gt: new Date() },
        },
        data: {
          lastVerificationAt: new Date(),
        },
      });
      this.logger.warn(
        'Public cache publication verification failed; hourly recovery remains active.',
      );
      return 'failed';
    } finally {
      await this.prisma.publicCacheInvalidation.updateMany({
        where: {
          scope: 'home',
          verificationLeaseToken: token,
        },
        data: { verificationLeaseToken: null, verificationLeaseUntil: null },
      });
    }
  }
}

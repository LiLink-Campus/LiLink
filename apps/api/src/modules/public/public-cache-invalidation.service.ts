import { createHash, createHmac, randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Optional,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { env } from '../../config/env';
import { normalizePublicHomeSnapshot } from '@lilink/shared';
import {
  readHomePublication,
  readInvalidationAcknowledgment,
} from './public-cache-publication';

import { PUBLIC_CACHE_DATABASE } from './public-cache-database';
import { PublicCacheSchedule } from './public-cache-schedule';
import { PublicCacheSignals } from './public-cache-signals';

type Scope = 'home' | 'schools';
type Pending = {
  scope: string;
  revision: bigint;
  dueAt: Date;
  attempts: number;
  deliveredHash: string | null;
};
const MAX_ATTEMPTS = 6;

@Injectable()
export class PublicCacheInvalidationService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(PublicCacheInvalidationService.name);
  private readonly sources = new Map<
    Scope,
    Array<{
      key: string;
      invalidate: () => void;
      read: (prisma: PrismaService) => Promise<unknown>;
    }>
  >();
  private readonly schedule = new PublicCacheSchedule(
    PublicCacheInvalidationService.name,
    () => this.enabled(),
    () => this.scan(),
  );

  constructor(
    @Inject(PUBLIC_CACHE_DATABASE) private readonly prisma: PrismaService,
    @Optional() private readonly signals?: PublicCacheSignals,
  ) {}

  register(
    scope: Scope,
    key: string,
    invalidate: () => void,
    read: (prisma: PrismaService) => Promise<unknown>,
  ) {
    this.sources.set(scope, [
      ...(this.sources.get(scope) ?? []),
      { key, invalidate, read },
    ]);
  }

  async snapshotHash(scope: Scope): Promise<string> {
    const sources = [...(this.sources.get(scope) ?? [])].sort((a, b) =>
      a.key.localeCompare(b.key),
    );
    if (!sources.length) throw new Error('Missing public cache source.');
    for (const source of sources) source.invalidate();
    const results = await Promise.allSettled(
      sources.map((source) => source.read(this.prisma)),
    );
    const values = results.map((result) => {
      if (result.status === 'rejected')
        throw new Error('Public snapshot database read failed.');
      return result.value;
    });
    const snapshot =
      scope === 'home'
        ? normalizePublicHomeSnapshot(
            Object.fromEntries(
              sources.map((source, index) => [source.key, values[index]]),
            ),
          )
        : values;
    return createHash('sha256')
      .update(
        JSON.stringify(snapshot, (key, value: unknown) =>
          key === 'generatedAt' ? undefined : value,
        ),
      )
      .digest('hex');
  }

  onApplicationBootstrap() {
    this.wake();
  }

  onModuleDestroy() {
    this.schedule.stop();
  }

  getSchedulingState() {
    return this.schedule.health();
  }

  private enabled() {
    return (
      !env.RELEASE_MAINTENANCE &&
      env.BACKGROUND_JOBS_ENABLED &&
      Boolean(env.PUBLIC_CACHE_REVALIDATION_URL) &&
      Boolean(env.PUBLIC_CACHE_REVALIDATION_SECRET)
    );
  }

  // Called only after a business commit. Durable triggers are the source of truth.
  wake() {
    this.schedule.wake();
  }

  async reconcile() {
    await this.schedule.run();
  }

  async flush() {
    await this.schedule.run(true);
  }

  private readyAt(row: {
    dueAt: Date;
    leaseUntil: Date | null;
    lastAttemptAt: Date | null;
  }) {
    return Math.max(
      row.dueAt.getTime(),
      row.leaseUntil?.getTime() ?? 0,
      row.lastAttemptAt ? row.lastAttemptAt.getTime() + 60_000 : 0,
    );
  }

  private async scan() {
    const rows = await this.prisma.publicCacheInvalidation.findMany({
      where: { exhaustedAt: null },
    });
    const home = rows.find((row) => row.scope === 'home');
    if (
      home?.deliveredHash &&
      home.verificationCompletedRevision !== home.acknowledgedRevision &&
      (home.verificationFailures < MAX_ATTEMPTS ||
        home.verificationTargetHash !== home.deliveredHash)
    ) {
      this.signals?.acknowledged();
    }
    let processed = false;
    for (const row of rows) {
      if (!this.schedule.active()) return { value: undefined };
      if (
        row.revision <= row.acknowledgedRevision ||
        !['home', 'schools'].includes(row.scope)
      )
        continue;
      if (this.readyAt(row) > Date.now()) continue;
      processed = true;
      if (row.attempts >= MAX_ATTEMPTS) {
        const exhausted = await this.prisma.publicCacheInvalidation.updateMany({
          where: {
            scope: row.scope,
            revision: row.revision,
            acknowledgedRevision: { lt: row.revision },
            exhaustedAt: null,
            attempts: { gte: MAX_ATTEMPTS },
            OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }],
          },
          data: { exhaustedAt: new Date(), leaseToken: null, leaseUntil: null },
        });
        if (exhausted.count === 1)
          this.logger.warn(
            `Public cache invalidation exhausted after lost worker: scope=${row.scope}.`,
          );
      } else await this.deliver(row);
    }
    if (!this.schedule.active()) return { value: undefined };
    // Read after writes/competition, including an unknown concurrent revision.
    const current = processed
      ? await this.prisma.publicCacheInvalidation.findMany({
          where: { exhaustedAt: null },
        })
      : rows;
    const deadlines = current
      .filter((row) => row.revision > row.acknowledgedRevision)
      .map((row) => Math.max(Date.now() + 1000, this.readyAt(row)));
    return {
      value: undefined,
      nextAt: deadlines.length ? Math.min(...deadlines) : undefined,
    };
  }

  private async deliver(row: Pending) {
    const token = randomUUID();
    const now = new Date();
    const claimed = await this.prisma.publicCacheInvalidation.updateMany({
      where: {
        scope: row.scope,
        revision: row.revision,
        acknowledgedRevision: { lt: row.revision },
        dueAt: { lte: now },
        exhaustedAt: null,
        attempts: { lt: MAX_ATTEMPTS },
        AND: [
          { OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
          {
            OR: [
              { lastAttemptAt: null },
              { lastAttemptAt: { lte: new Date(now.getTime() - 60_000) } },
            ],
          },
        ],
      },
      data: {
        leaseToken: token,
        leaseUntil: new Date(now.getTime() + 30_000),
        lastAttemptAt: now,
        attempts: { increment: 1 },
      },
    });
    if (claimed.count !== 1 || !this.schedule.active()) return;
    const scope = row.scope as Scope;
    // Snapshot DB failures belong to scan recovery, never HTTP retry accounting.
    const hash = await this.snapshotHash(scope);
    if (!this.schedule.active()) return;
    let equal = scope === 'schools' && hash === row.deliveredHash;
    if (scope === 'home' && hash === row.deliveredHash) {
      try {
        const probe = await readHomePublication();
        equal = probe.kind === 'published' && probe.hash === hash;
      } catch {
        /* A failed proof requires the normal notification path. */
      }
    }
    if (!this.schedule.active()) return;
    const ownership = {
      scope,
      leaseToken: token,
      leaseUntil: { gt: new Date() },
    };
    if (equal) {
      const saved = await this.prisma.publicCacheInvalidation.updateMany({
        where: ownership,
        data: {
          acknowledgedRevision: row.revision,
          leaseToken: null,
          leaseUntil: null,
          attempts: 0,
        },
      });
      if (saved.count === 1 && scope === 'home') this.signals?.acknowledged();
      return;
    }
    const renewed = await this.prisma.publicCacheInvalidation.updateMany({
      where: ownership,
      data: { leaseUntil: new Date(Date.now() + 30_000) },
    });
    if (renewed.count !== 1 || !this.schedule.active()) return;
    let retrySeconds: number | undefined;
    let failed = false;
    try {
      const body = JSON.stringify({ scope, revision: row.revision.toString() });
      const timestamp = Math.floor(Date.now() / 1_000).toString();
      const signature = createHmac(
        'sha256',
        env.PUBLIC_CACHE_REVALIDATION_SECRET,
      )
        .update(`${timestamp}.${body}`)
        .digest('hex');
      const response = await fetch(env.PUBLIC_CACHE_REVALIDATION_URL, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          'x-lilink-timestamp': timestamp,
          'x-lilink-signature': signature,
        },
        body,
        signal: AbortSignal.timeout(5_000),
      });
      if (response.status === 429) {
        await response.body?.cancel();
        const seconds = Number(response.headers.get('retry-after'));
        if (!Number.isInteger(seconds) || seconds < 1 || seconds > 1800)
          throw new Error('Invalid deferral.');
        retrySeconds = Math.max(60, seconds);
      } else {
        if (!response.ok) {
          await response.body?.cancel();
          throw new Error('Revalidation rejected.');
        }
        await readInvalidationAcknowledgment(response);
      }
    } catch {
      failed = true;
    }
    if (!this.schedule.active()) return;
    // Persistence errors propagate to the independent scan budget. In particular
    // an unknown acknowledgment must not be overwritten as an HTTP failure.
    if (failed || retrySeconds) {
      const attempts = row.attempts + 1;
      await this.prisma.publicCacheInvalidation.updateMany({
        where: { scope, leaseToken: token, leaseUntil: { gt: new Date() } },
        data: {
          leaseToken: null,
          leaseUntil: null,
          dueAt: new Date(
            Date.now() +
              (retrySeconds ?? Math.min(900, 60 * 2 ** (attempts - 1))) * 1000,
          ),
          ...(retrySeconds
            ? { attempts: { decrement: 1 } }
            : { exhaustedAt: attempts >= MAX_ATTEMPTS ? new Date() : null }),
        },
      });
      if (failed)
        this.logger.warn(
          `Public cache invalidation failed: scope=${scope}, attempt=${attempts}, exhausted=${attempts >= MAX_ATTEMPTS}.`,
        );
      return;
    }
    const acknowledged = await this.prisma.$executeRaw`
      UPDATE "PublicCacheInvalidation"
      SET "acknowledgedRevision" = ${row.revision}, "lastDeliveredAt" = NOW(), "deliveredHash" = ${hash},
        "leaseToken" = NULL, "leaseUntil" = NULL, "attempts" = 0,
        "verificationFailures" = CASE WHEN "deliveredHash" IS DISTINCT FROM ${hash} THEN 0 ELSE "verificationFailures" END,
        "verificationTargetHash" = ${hash},
        "urgent" = CASE WHEN "revision" = ${row.revision} THEN false ELSE "urgent" END,
        "dueAt" = GREATEST("dueAt", NOW() + INTERVAL '30 minutes')
      WHERE "scope" = ${scope} AND "leaseToken" = ${token} AND "leaseUntil" > NOW()
    `;
    if (acknowledged === 1) {
      this.logger.log(
        `Public cache notification acknowledged: scope=${scope}, revision=${row.revision}.`,
      );
      if (scope === 'home') this.signals?.acknowledged();
    }
  }
}

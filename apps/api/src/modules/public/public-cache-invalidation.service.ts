import { createHash, createHmac, randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { env } from '../../config/env';

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
    Array<{ key: string; invalidate: () => void; read: () => Promise<unknown> }>
  >();
  private timer?: ReturnType<typeof setTimeout>;
  private scheduledAt = 0;
  private flushing = false;
  private rerun = false;
  private stopped = false;

  constructor(private readonly prisma: PrismaService) {}

  register(
    scope: Scope,
    key: string,
    invalidate: () => void,
    read: () => Promise<unknown>,
  ) {
    this.sources.set(scope, [
      ...(this.sources.get(scope) ?? []),
      { key, invalidate, read },
    ]);
  }

  onApplicationBootstrap() {
    this.wake();
  }

  onModuleDestroy() {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  private enabled() {
    return (
      !this.stopped &&
      !env.RELEASE_MAINTENANCE &&
      env.BACKGROUND_JOBS_ENABLED &&
      Boolean(env.PUBLIC_CACHE_REVALIDATION_URL) &&
      Boolean(env.PUBLIC_CACHE_REVALIDATION_SECRET)
    );
  }

  // Called only after a business commit. Durable triggers are the source of truth.
  wake() {
    if (!this.enabled()) return;
    clearTimeout(this.timer);
    this.scheduledAt = 0;
    this.schedule(new Date());
  }

  @Cron('* * * * *', {
    name: 'public-cache-invalidation',
    waitForCompletion: true,
  })
  async reconcile() {
    await this.flush();
  }

  async flush() {
    if (!this.enabled()) return;
    if (this.flushing) {
      this.rerun = true;
      return;
    }
    this.flushing = true;
    try {
      const rows = await this.prisma.publicCacheInvalidation.findMany({
        where: { exhaustedAt: null },
      });
      for (const row of rows) {
        if (row.revision <= row.acknowledgedRevision) continue;
        if (row.scope !== 'home' && row.scope !== 'schools') continue;
        const readyAt = new Date(
          Math.max(
            row.dueAt.getTime(),
            row.leaseUntil?.getTime() ?? 0,
            row.lastAttemptAt ? row.lastAttemptAt.getTime() + 60_000 : 0,
          ),
        );
        if (readyAt.getTime() > Date.now()) {
          this.schedule(readyAt);
          continue;
        }
        // A worker can disappear after consuming its final attempt. Recover
        // that durable budget before allowing another process to claim it.
        if (row.attempts >= MAX_ATTEMPTS) {
          const exhausted =
            await this.prisma.publicCacheInvalidation.updateMany({
              where: {
                scope: row.scope,
                revision: row.revision,
                acknowledgedRevision: { lt: row.revision },
                exhaustedAt: null,
                attempts: { gte: MAX_ATTEMPTS },
                OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }],
              },
              data: {
                exhaustedAt: new Date(),
                leaseToken: null,
                leaseUntil: null,
              },
            });
          if (exhausted.count === 1) {
            this.logger.warn(
              `Public cache invalidation exhausted after lost worker: scope=${row.scope}, attempt=${row.attempts}.`,
            );
          }
          continue;
        }
        await this.deliver(row);
      }
    } catch {
      // Never log transport URLs, credentials, payloads, or database errors.
      this.logger.warn(
        'Public cache invalidation scan failed; TTL fallback remains active.',
      );
    } finally {
      this.flushing = false;
      if (this.rerun) {
        this.rerun = false;
        this.schedule(new Date());
      }
    }
  }

  private schedule(at: Date) {
    const delay = Math.max(1_000, at.getTime() - Date.now());
    if (this.scheduledAt && this.scheduledAt <= Date.now() + delay) return;
    if (this.timer) clearTimeout(this.timer);
    this.scheduledAt = Date.now() + delay;
    this.timer = setTimeout(() => {
      this.scheduledAt = 0;
      void this.flush();
    }, delay);
    this.timer.unref();
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
    if (claimed.count !== 1) return;

    const scope = row.scope as Scope;
    try {
      const sources = [...(this.sources.get(scope) ?? [])].sort((a, b) =>
        a.key.localeCompare(b.key),
      );
      if (!sources.length) throw new Error('Missing public cache source.');
      for (const source of sources) source.invalidate();
      const snapshot = await Promise.all(
        sources.map((source) => source.read()),
      );
      const hash = createHash('sha256')
        .update(
          JSON.stringify(snapshot, (key, value: unknown) =>
            key === 'generatedAt' ? undefined : value,
          ),
        )
        .digest('hex');
      if (hash === row.deliveredHash) {
        await this.prisma.publicCacheInvalidation.updateMany({
          where: { scope, leaseToken: token },
          data: {
            acknowledgedRevision: row.revision,
            leaseToken: null,
            leaseUntil: null,
            attempts: 0,
          },
        });
        this.schedule(new Date(Date.now() + 60_000));
        return;
      }
      // Slow database reads must not let an expired worker notify after takeover.
      const renewed = await this.prisma.publicCacheInvalidation.updateMany({
        where: { scope, leaseToken: token, leaseUntil: { gt: new Date() } },
        data: { leaseUntil: new Date(Date.now() + 30_000) },
      });
      if (renewed.count !== 1) {
        throw new Error('Public cache delivery lease expired.');
      }
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
      await response.body?.cancel();
      if (response.status === 429) {
        const seconds = Number(response.headers.get('retry-after'));
        if (!Number.isInteger(seconds) || seconds < 1 || seconds > 1800) {
          throw new Error('Invalid revalidation deferral.');
        }
        const retryAt = new Date(Date.now() + Math.max(60, seconds) * 1000);
        await this.prisma.publicCacheInvalidation.updateMany({
          where: { scope, leaseToken: token },
          data: {
            leaseToken: null,
            leaseUntil: null,
            dueAt: retryAt,
            attempts: { decrement: 1 },
          },
        });
        this.schedule(retryAt);
        return;
      }
      if (!response.ok) throw new Error('Revalidation rejected.');
      // A concurrent mutation must keep its newer revision pending.
      await this.prisma.$executeRaw`
        UPDATE "PublicCacheInvalidation"
        SET "acknowledgedRevision" = ${row.revision}, "lastDeliveredAt" = NOW(), "deliveredHash" = ${hash},
          "leaseToken" = NULL, "leaseUntil" = NULL, "attempts" = 0,
          "urgent" = CASE WHEN "revision" = ${row.revision} THEN false ELSE "urgent" END,
          "dueAt" = GREATEST("dueAt", NOW() + INTERVAL '30 minutes')
        WHERE "scope" = ${scope} AND "leaseToken" = ${token}
      `;
      this.logger.log(
        `Public cache notification acknowledged: scope=${scope}, revision=${row.revision}.`,
      );
      this.schedule(new Date(Date.now() + 60_000));
    } catch {
      const attempts = row.attempts + 1;
      const retryAt = new Date(
        Date.now() + Math.min(900, 60 * 2 ** (attempts - 1)) * 1_000,
      );
      await this.prisma.publicCacheInvalidation.updateMany({
        where: { scope, leaseToken: token },
        data: {
          leaseToken: null,
          leaseUntil: null,
          dueAt: retryAt,
          exhaustedAt: attempts >= MAX_ATTEMPTS ? new Date() : null,
        },
      });
      this.logger.warn(
        `Public cache invalidation failed: scope=${scope}, attempt=${attempts}, exhausted=${attempts >= MAX_ATTEMPTS}.`,
      );
      if (attempts < MAX_ATTEMPTS) this.schedule(retryAt);
    }
  }
}

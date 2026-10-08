import { createServer, type Server } from 'node:http';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import {
  createPrismaClient,
  type PrismaClient,
} from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { env } from '../src/config/env';
import { PublicCacheInvalidationService } from '../src/modules/public/public-cache-invalidation.service';
import { PublicCachePublicationService } from '../src/modules/public/public-cache-publication.service';
import { PublicCacheSignals } from '../src/modules/public/public-cache-signals';
import { createPublicCacheDatabase } from '../src/modules/public/public-cache-database';
import { databaseFaultProxy } from './mail-recovery-smtp';

// Only scheduler cadence is shortened. Date, PostgreSQL NOW(), socket timeouts,
// statement cancellation and the automatic timer path remain real.
jest.mock('../src/modules/public/public-cache-schedule', () => {
  const actual = jest.requireActual<
    typeof import('../src/modules/public/public-cache-schedule')
  >('../src/modules/public/public-cache-schedule');
  return {
    PublicCacheSchedule: class extends actual.PublicCacheSchedule<unknown> {
      constructor(
        ...args: ConstructorParameters<typeof actual.PublicCacheSchedule>
      ) {
        super(args[0], args[1], args[2], {
          retryMs: [200, 300, 400, 500],
          idleMs: 2000,
        });
      }
    },
  };
});
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const hash = 'a'.repeat(64);
async function until(
  check: () => boolean | Promise<boolean>,
  timeout = 90_000,
) {
  const end = Date.now() + timeout;
  do {
    if (await check()) return;
    await wait(100);
  } while (Date.now() < end);
  throw new Error('Automatic cache recovery deadline exceeded.');
}

describe('Public cache database fault recovery', () => {
  let db: PrismaClient;
  let workerDb: ReturnType<typeof createPublicCacheDatabase>;
  let proxy: Awaited<ReturnType<typeof databaseFaultProxy>>;
  let invalidation: PublicCacheInvalidationService;
  let publication: PublicCachePublicationService;
  let server: Server;
  const evidence: Array<Record<string, unknown>> = [];
  const original = { ...env };
  let notifications = 0;
  function start(client = workerDb as PrismaService, mode = 'publication') {
    const signals = new PublicCacheSignals();
    invalidation = new PublicCacheInvalidationService(client, signals);
    invalidation.register(
      'schools',
      'schools',
      () => {},
      () => Promise.resolve(['synthetic-school']),
    );
    publication = new PublicCachePublicationService(
      client,
      invalidation,
      signals,
    );
    if (mode === 'publication') publication.onApplicationBootstrap();
    else invalidation.onApplicationBootstrap();
  }
  function stop() {
    invalidation?.onModuleDestroy();
    publication?.onModuleDestroy();
  }
  const home = () =>
    db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
  beforeAll(async () => {
    const url = new URL(env.DATABASE_URL);
    if (
      !['127.0.0.1', 'localhost'].includes(url.hostname) ||
      url.port === '5432' ||
      !url.pathname.startsWith('/lilink_vip_test_')
    )
      throw new Error('Disposable API database required.');
    db = createPrismaClient();
    proxy = await databaseFaultProxy(Number(url.port));
    server = createServer((req, res) => {
      if (req.method === 'POST') {
        notifications++;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, invalidated: true }));
      } else {
        res.setHeader('content-type', 'text/html');
        res.end(
          `<html><div data-lilink-home-fingerprint="v1:${hash}"></div></html>`,
        );
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    Object.assign(env, {
      BACKGROUND_JOBS_ENABLED: true,
      RELEASE_MAINTENANCE: false,
      PUBLIC_CACHE_REVALIDATION_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}/api/internal/public-cache/revalidate`,
      PUBLIC_CACHE_REVALIDATION_SECRET: 'synthetic-cache-fault-secret-00000000',
    });
  });
  beforeEach(async () => {
    notifications = 0;
    await db.publicCacheInvalidation.deleteMany();
    await db.publicCacheInvalidation.createMany({
      data: [
        {
          scope: 'home',
          revision: 10n,
          acknowledgedRevision: 10n,
          deliveredHash: hash,
          verificationTargetHash: hash,
        },
        {
          scope: 'schools',
          revision: 2n,
          acknowledgedRevision: 1n,
          dueAt: new Date(0),
        },
      ],
    });
    const databaseUrl = process.env.DATABASE_URL;
    try {
      const url = new URL(databaseUrl!);
      url.port = String(proxy.port);
      process.env.DATABASE_URL = url.toString();
      workerDb = createPublicCacheDatabase();
    } finally {
      process.env.DATABASE_URL = databaseUrl;
    }
  });
  afterEach(async () => {
    stop();
    proxy.resume();
    await workerDb.$disconnect();
  });
  afterAll(async () => {
    stop();
    await proxy?.stop();
    await db?.publicCacheInvalidation.deleteMany();
    await db?.$disconnect();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    Object.assign(env, original);
    if (process.env.E2E_OUTPUT)
      await writeFile(
        path.join(process.env.E2E_OUTPUT, 'public-cache-faults.json'),
        JSON.stringify(
          {
            clock:
              'Real JS and PostgreSQL clocks; 200/300/400/500/2000ms scheduler cadence; production network deadlines',
            evidence,
          },
          null,
          2,
        ),
      );
  });

  it.each(['publication', 'invalidation'])(
    'automatically recovers %s after a connection blackhole',
    async (mode) => {
      proxy.pause();
      const closedBefore = proxy.closedConnections();
      const startedAt = Date.now();
      start(workerDb as PrismaService, mode);
      const worker = mode === 'publication' ? publication : invalidation;
      await until(
        () => worker.getSchedulingState().state === 'unknown',
        15_000,
      );
      const fault = worker.getSchedulingState();
      const confirmedAt = Date.now();
      expect(confirmedAt - startedAt).toBeLessThan(12_000);
      expect(fault.consecutiveFailures).toBe(1);
      expect(fault.nextRecoveryAt! - confirmedAt).toBeGreaterThan(50);
      await until(() => proxy.closedConnections() > closedBefore, 3000);
      expect((await home()).verificationFailures).toBe(0);
      proxy.resume();
      await until(() => worker.getSchedulingState().state === 'healthy');
      const recoveredAt = Date.now();
      expect(recoveredAt).toBeGreaterThanOrEqual(fault.nextRecoveryAt!);
      expect(recoveredAt - fault.nextRecoveryAt!).toBeLessThan(3000);
      if (mode === 'publication')
        expect((await home()).verificationCompletedRevision).toBe(10n);
      else expect(notifications).toBe(1);
      evidence.push({
        boundary: `${mode}-connection`,
        startedAt,
        confirmedAt,
        recoveryDeadline: fault.nextRecoveryAt,
        recoveredAt,
        actualConnectionsReleased: proxy.closedConnections() - closedBefore,
        passed: true,
      });
    },
    100_000,
  );

  it('cancels a real blocked SQL query before scheduling recovery', async () => {
    const lock = new Client({ connectionString: env.DATABASE_URL });
    await lock.connect();
    await lock.query('BEGIN');
    await lock.query(
      'LOCK TABLE "PublicCacheInvalidation" IN ACCESS EXCLUSIVE MODE',
    );
    const startedAt = Date.now();
    try {
      start();
      await until(
        () => publication.getSchedulingState().state === 'unknown',
        15_000,
      );
      const fault = publication.getSchedulingState();
      const active = await db.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count FROM pg_stat_activity
        WHERE application_name = 'lilink-public-cache' AND state = 'active'
      `;
      expect(active[0].count).toBe(0);
      await lock.query('ROLLBACK');
      await until(() => publication.getSchedulingState().state === 'healthy');
      expect((await home()).verificationCompletedRevision).toBe(10n);
      evidence.push({
        boundary: 'blocked-query',
        startedAt,
        recoveryDeadline: fault.nextRecoveryAt,
        recoveredAt: Date.now(),
        activeQueriesAfterTimeout: active[0].count,
        passed: true,
      });
    } finally {
      await lock.end();
    }
  }, 100_000);

  it('rereads a committed notification when the acknowledgment result is lost', async () => {
    let lost = false;
    const ambiguous = workerDb.$extends({
      query: {
        async $executeRaw({ args, query }) {
          const result = (await query(args)) as number;
          if (!lost) {
            lost = true;
            throw new Error('Synthetic lost commit response');
          }
          return result;
        },
      },
    });
    start(ambiguous as unknown as PrismaService, 'invalidation');
    await until(
      () => invalidation.getSchedulingState().state === 'unknown',
      10_000,
    );
    const fault = invalidation.getSchedulingState();
    expect(notifications).toBe(1);
    const acknowledged = await db.publicCacheInvalidation.findUniqueOrThrow({
      where: { scope: 'schools' },
    });
    expect(acknowledged.acknowledgedRevision).toBe(2n);
    await until(() => invalidation.getSchedulingState().state === 'healthy');
    expect(notifications).toBe(1);
    evidence.push({
      boundary: 'unknown-acknowledgment-result',
      recoveryDeadline: fault.nextRecoveryAt,
      recoveredAt: Date.now(),
      duplicateNotifications: notifications - 1,
      passed: true,
    });
  }, 80_000);

  it('recovers an unknown committed verification claim without spending another attempt before its gate', async () => {
    let lost = false;
    const ambiguous = workerDb.$extends({
      query: {
        async $executeRaw({ args, query }) {
          const result = (await query(args)) as number;
          if (!lost) {
            lost = true;
            // Reproduce an old committed claim near expiry without advancing SQL time.
            await db.publicCacheInvalidation.update({
              where: { scope: 'home' },
              data: {
                lastVerificationAt: new Date(Date.now() - 298_000),
                verificationLeaseUntil: new Date(Date.now() + 1800),
              },
            });
            throw new Error('Synthetic lost claim response');
          }
          return result;
        },
      },
    });
    start(ambiguous as unknown as PrismaService);
    await until(
      () => publication.getSchedulingState().state === 'unknown',
      10_000,
    );
    const claimed = await home();
    expect(claimed.verificationFailures).toBe(1);
    const eligibilityAt = claimed.lastVerificationAt!.getTime() + 300_000;
    await until(() => publication.getSchedulingState().state === 'healthy');
    expect((await home()).verificationFailures).toBe(1);
    expect((await home()).verificationCompletedRevision).toBeNull();
    await until(
      async () => (await home()).verificationCompletedRevision === 10n,
      10_000,
    );
    const completedAt = Date.now();
    expect(completedAt).toBeGreaterThanOrEqual(eligibilityAt);
    expect(completedAt - eligibilityAt).toBeLessThan(3000);
    evidence.push({
      boundary: 'unknown-claim-result',
      eligibilityAt,
      completedAt,
      preservedAttemptDuringRecovery: true,
      passed: true,
    });
  }, 20_000);

  it('exhausts real database scan failures, keeps its budget on signals, and automatically recovers', async () => {
    await db.$executeRawUnsafe(
      'ALTER TABLE "PublicCacheInvalidation" RENAME TO "CacheFaultFixture"',
    );
    let renamed = true;
    try {
      start();
      for (let failure = 1; failure <= 5; failure++) {
        await until(
          () =>
            publication.getSchedulingState().consecutiveFailures === failure,
          5000,
        );
        const state = publication.getSchedulingState();
        await publication.verify();
        await publication.reconcile();
        expect(publication.getSchedulingState().consecutiveFailures).toBe(
          failure,
        );
        expect(publication.getSchedulingState().nextRecoveryAt).toBe(
          state.nextRecoveryAt,
        );
      }
      expect(publication.getSchedulingState().state).toBe('degraded');
      await db.$executeRawUnsafe(
        'ALTER TABLE "CacheFaultFixture" RENAME TO "PublicCacheInvalidation"',
      );
      renamed = false;
      expect((await home()).verificationFailures).toBe(0);
      await until(
        () => publication.getSchedulingState().state === 'healthy',
        5000,
      );
      expect((await home()).verificationCompletedRevision).toBe(10n);
      evidence.push({
        boundary: 'database-scan-budget',
        failuresBeforeDegraded: 5,
        automaticRecovery: true,
        passed: true,
      });
    } finally {
      stop();
      if (renamed)
        await db.$executeRawUnsafe(
          'ALTER TABLE "CacheFaultFixture" RENAME TO "PublicCacheInvalidation"',
        );
    }
  }, 15_000);

  it('does not query PostgreSQL between short idle boundaries and automatically polls at the boundary', async () => {
    let databaseQueries = 0;
    const monitored = workerDb.$extends({
      query: {
        $allOperations({ args, query }) {
          databaseQueries++;
          return query(args);
        },
      },
    });
    start(monitored as unknown as PrismaService);
    await until(
      async () => (await home()).verificationCompletedRevision === 10n,
      5000,
    );
    await until(() => !publication.getSchedulingState().running, 1000);
    if (publication.getSchedulingState().nextRunAt! - Date.now() < 600) {
      const previousDeadline = publication.getSchedulingState().nextRunAt!;
      await until(
        () =>
          !publication.getSchedulingState().running &&
          publication.getSchedulingState().nextRunAt! > previousDeadline,
        3000,
      );
    }
    const idleQueries = databaseQueries;
    const deadline = publication.getSchedulingState().nextRunAt!;
    await wait(400);
    expect(databaseQueries).toBe(idleQueries);
    expect(Date.now()).toBeLessThan(deadline);
    await until(() => databaseQueries > idleQueries, 3000);
    expect(Date.now()).toBeGreaterThanOrEqual(deadline);
    evidence.push({
      boundary: 'short-real-postgres-idle',
      idleQueries,
      queriesAfterAutomaticPoll: databaseQueries,
      passed: true,
    });
  });
});

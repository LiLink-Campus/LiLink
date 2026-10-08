import { createServer, type Server } from 'node:http';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
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

// Declared before implementation: durable acknowledgment is not publication;
// gate/lease/CAS deferrals must resume automatically, historical A -> B -> A
// cannot complete a new target, and DB failures must retain UNKNOWN and release
// actual queries. No manual verify/wake or date edits during timed assertions.
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
async function eventually(check: () => Promise<boolean>, timeout = 12_000) {
  const end = Date.now() + timeout;
  do {
    if (await check()) return;
    await wait(100);
  } while (Date.now() < end);
  throw new Error('Automatic background outcome did not converge.');
}

describe('Public cache automatic scheduling with PostgreSQL and HTTP', () => {
  let db: PrismaClient;
  let workerDb: ReturnType<typeof createPublicCacheDatabase>;
  let invalidation: PublicCacheInvalidationService;
  let publication: PublicCachePublicationService;
  let server: Server;
  let served = hashA;
  let probeCount = 0;
  let holdProbe: (() => Promise<void>) | undefined;
  const original = { ...env };
  const evidence: Array<Record<string, unknown>> = [];
  const row = () =>
    db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
  function start() {
    const signals = new PublicCacheSignals();
    invalidation = new PublicCacheInvalidationService(
      workerDb as PrismaService,
      signals,
    );
    publication = new PublicCachePublicationService(
      workerDb as PrismaService,
      invalidation,
      signals,
    );
    publication.onApplicationBootstrap();
  }
  async function stop() {
    publication?.onModuleDestroy();
    invalidation?.onModuleDestroy();
    await wait(100);
  }
  beforeAll(async () => {
    const url = new URL(env.DATABASE_URL);
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.port === '5432' ||
      !url.pathname.startsWith('/lilink_vip_test_')
    )
      throw new Error('Disposable API runner required.');
    db = createPrismaClient();
    workerDb = createPublicCacheDatabase();
    server = createServer((req, res) => {
      if (req.method === 'POST') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, invalidated: true }));
      } else {
        probeCount++;
        res.setHeader('content-type', 'text/html');
        const html = `<html><div data-lilink-home-fingerprint="v1:${served}"></div></html>`;
        if (holdProbe) void holdProbe().then(() => res.end(html));
        else res.end(html);
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address() as { port: number };
    Object.assign(env, {
      BACKGROUND_JOBS_ENABLED: true,
      RELEASE_MAINTENANCE: false,
      PUBLIC_CACHE_REVALIDATION_URL: `http://127.0.0.1:${address.port}/api/internal/public-cache/revalidate`,
      PUBLIC_CACHE_REVALIDATION_SECRET:
        'synthetic-cache-scheduling-secret-0000',
    });
  });
  beforeEach(async () => {
    served = hashA;
    probeCount = 0;
    holdProbe = undefined;
    await db.publicCacheInvalidation.deleteMany();
    await db.publicCacheInvalidation.create({
      data: {
        scope: 'home',
        revision: 10n,
        acknowledgedRevision: 10n,
        deliveredHash: hashA,
        dueAt: new Date(),
        verificationTargetHash: hashA,
      },
    });
  });
  afterEach(stop);
  afterAll(async () => {
    await stop();
    await workerDb?.$disconnect();
    await db?.publicCacheInvalidation.deleteMany();
    await db?.$disconnect();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    Object.assign(env, original);
    if (process.env.E2E_OUTPUT)
      await writeFile(
        path.join(process.env.E2E_OUTPUT, 'public-cache-scheduling.json'),
        JSON.stringify(
          {
            isolation:
              'Disposable PostgreSQL; real HTTP fingerprint fixture; automatic production timers',
            evidence,
          },
          null,
          2,
        ),
      );
  });

  it.each(['gate', 'lease'] as const)(
    'automatically resumes %s deferral without consuming attempts',
    async (kind) => {
      const due = Date.now() + 2500;
      await db.publicCacheInvalidation.update({
        where: { scope: 'home' },
        data:
          kind === 'gate'
            ? { lastVerificationAt: new Date(due - 300_000) }
            : {
                verificationLeaseToken: 'synthetic-owner',
                verificationLeaseUntil: new Date(due),
              },
      });
      start();
      await wait(1600);
      expect(probeCount).toBe(0);
      expect((await row()).verificationFailures).toBe(0);
      await eventually(
        async () => (await row()).verificationCompletedRevision === 10n,
      );
      const completedAt = Date.now();
      expect((await row()).verificationOutcome).toBe('verified');
      expect(completedAt - due).toBeLessThan(60_000);
      evidence.push({
        boundary: kind,
        due,
        completedAt,
        schedulingErrorMs: completedAt - due,
        passed: true,
      });
    },
  );

  it('recovers a new A target despite historical A success and no notification wake after commit', async () => {
    served = hashB;
    await db.publicCacheInvalidation.update({
      where: { scope: 'home' },
      data: {
        verificationCompletedRevision: 8n,
        verificationOutcome: 'verified',
        verifiedHash: hashA,
        lastVerificationAt: new Date(Date.now() - 298_000),
      },
    });
    start();
    await wait(1200);
    expect((await row()).verificationCompletedRevision).toBe(8n);
    served = hashA;
    await eventually(
      async () => (await row()).verificationCompletedRevision === 10n,
    );
    evidence.push({
      boundary: 'restart-A-B-A',
      probes: probeCount,
      passed: true,
    });
  });

  it('does not allow an old owner to complete a concurrent new notification', async () => {
    await db.publicCacheInvalidation.update({
      where: { scope: 'home' },
      data: {
        verificationLeaseToken: 'old-worker',
        verificationLeaseUntil: new Date(Date.now() + 2200),
        verifiedHash: hashA,
        verificationCompletedRevision: 9n,
        verificationOutcome: 'verified',
      },
    });
    start();
    await wait(1200);
    await db.publicCacheInvalidation.update({
      where: { scope: 'home' },
      data: {
        revision: 11n,
        acknowledgedRevision: 11n,
        deliveredHash: hashB,
      },
    });
    served = hashB;
    await eventually(
      async () => (await row()).verificationCompletedRevision === 11n,
    );
    expect((await row()).verifiedHash).toBe(hashB);
    evidence.push({ boundary: 'target-changes-during-deferral', passed: true });
  });

  it('keeps exhausted and unsupported states distinct from verified success', async () => {
    await db.publicCacheInvalidation.update({
      where: { scope: 'home' },
      data: { verificationFailures: 6 },
    });
    start();
    await wait(1500);
    expect(probeCount).toBe(0);
    expect((await row()).verificationCompletedRevision).toBeNull();
    await stop();
    await db.publicCacheInvalidation.update({
      where: { scope: 'home' },
      data: { verificationFailures: 0 },
    });
    served = '';
    start();
    await eventually(
      async () => (await row()).verificationOutcome === 'unsupported',
    );
    expect((await row()).verifiedHash).toBeNull();
    evidence.push({ boundary: 'terminal-states', passed: true });
  });

  it('allows only one of two automatic workers to consume a verification attempt', async () => {
    const due = Date.now() + 1500;
    await db.publicCacheInvalidation.update({
      where: { scope: 'home' },
      data: {
        lastVerificationAt: new Date(due - 300_000),
      },
    });
    start();
    const contender = new PublicCachePublicationService(
      workerDb as PrismaService,
      invalidation,
      new PublicCacheSignals(),
    );
    contender.onApplicationBootstrap();
    try {
      await eventually(
        async () => (await row()).verificationCompletedRevision === 10n,
      );
      expect(probeCount).toBe(1);
      expect((await row()).verificationFailures).toBe(0);
      evidence.push({
        boundary: 'automatic-CAS-competition',
        probes: probeCount,
        passed: true,
      });
    } finally {
      contender.onModuleDestroy();
    }
  });

  it('does not complete or charge a superseded target when its HTTP read finishes late', async () => {
    let release!: () => void;
    holdProbe = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });
    start();
    await eventually(() => Promise.resolve(probeCount === 1));
    await db.publicCacheInvalidation.update({
      where: { scope: 'home' },
      data: {
        revision: 11n,
        acknowledgedRevision: 11n,
      },
    });
    holdProbe = undefined;
    release();
    await eventually(async () => (await row()).verificationLeaseToken === null);
    const current = await row();
    expect(current.verificationCompletedRevision).toBeNull();
    expect(current.verificationFailures).toBe(0);
    expect(publication.getSchedulingState().nextRunAt).toBeGreaterThan(
      Date.now(),
    );
    evidence.push({
      boundary: 'superseded-in-flight-read',
      completedNewTarget: false,
      attempts: current.verificationFailures,
      passed: true,
    });
  });

  it('does not query after disable, maintenance, or shutdown', async () => {
    for (const mode of ['disabled', 'maintenance', 'shutdown']) {
      Object.assign(env, {
        BACKGROUND_JOBS_ENABLED: mode !== 'disabled',
        RELEASE_MAINTENANCE: mode === 'maintenance',
      });
      start();
      if (mode === 'shutdown') await stop();
      await wait(1200);
      expect(probeCount).toBe(0);
      expect((await row()).lastVerificationAt).toBeNull();
      await stop();
    }
    evidence.push({ boundary: 'lifecycle', passed: true });
  });
});

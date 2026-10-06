import { randomUUID } from 'node:crypto';
import {
  smtpBlackhole,
  smtpAckProxy,
  databaseFaultProxy,
  proxiedMailDatabase,
} from './mail-recovery-smtp';
import { writeRecoveryArtifact } from './mail-recovery-artifact';
import { finalAttemptCompletionFault } from './mail-recovery-completion';
import {
  recoveryCode,
  recoveryMail,
  assertRecoveryDatabase,
  waitForMailRowLock,
  withMailRowLock,
  type CodeState,
} from './mail-recovery-data';
import MockDate from 'mockdate';
import { MailService } from '../src/common/mail/mail.service';
import { createMailDatabase } from '../src/common/mail/mail-database';
import { createPrismaClient, PrismaClient } from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { env } from '../src/config/env';

jest.setTimeout(60_000);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Mail outbox recovery with PostgreSQL and real Mailpit', () => {
  let prisma: PrismaClient;
  let deliveryDb: ReturnType<typeof createMailDatabase>;
  let mail: MailService;
  let databaseProxy: Awaited<ReturnType<typeof databaseFaultProxy>>;
  const tag = `recovery-${randomUUID()}`;
  const original = { ...env };
  const timeline: Array<Record<string, unknown>> = [];
  const assertions: string[] = [];
  let now = Date.now();
  let paused = false;

  function advance(ms: number) {
    now += ms;
    MockDate.set(now);
    timeline.push({ event: 'api-time', at: now });
  }
  function fault(action: 'pause' | 'unpause') {
    if (action === 'pause') databaseProxy.pause();
    else databaseProxy.resume();
    paused = action === 'pause';
    timeline.push({ event: `database-network-${action}`, at: now });
  }
  async function received() {
    const response = await fetch(`${process.env.E2E_MAIL_URL}/api/v1/messages`);
    expect(response.ok).toBe(true);
    const body = (await response.json()) as { total: number };
    return body.total;
  }
  const queue = (data: Record<string, unknown> = {}) =>
    recoveryMail(prisma, tag, data);
  const outboxStatus = async (id: string) =>
    (await prisma.outboundEmail.findUniqueOrThrow({ where: { id } })).status;
  const code = (state: CodeState) => recoveryCode(prisma, tag, now, state);
  function verify(name: string) {
    assertions.push(name);
  }

  beforeAll(async () => {
    const url = new URL(env.DATABASE_URL);
    assertRecoveryDatabase(url);
    Object.assign(env, {
      OUTBOUND_EMAIL_IDLE_POLL_MS: 60_000,
      OUTBOUND_EMAIL_SCAN_BACKOFF_MAX_MS: 120_000,
      OUTBOUND_EMAIL_DB_TIMEOUT_MS: 1000,
      OUTBOUND_EMAIL_SMTP_TIMEOUT_MS: 2000,
      OUTBOUND_EMAIL_SEND_WAIT_TIMEOUT_MS: 3000,
      OUTBOUND_EMAIL_FLUSH_BATCH_SIZE: 2,
      SMTP_SEND_CONCURRENCY: 1,
      SMTP_MAX_CONNECTIONS: 1,
    });
    MockDate.set(now);
    prisma = createPrismaClient();
    await prisma.$connect();
    databaseProxy = await databaseFaultProxy(Number(url.port));
    deliveryDb = proxiedMailDatabase(databaseProxy.port);
    mail = new MailService(deliveryDb as PrismaService);
  });
  afterAll(async () => {
    if (paused) fault('unpause');
    MockDate.reset();
    const rows = prisma
      ? await prisma.outboundEmail.findMany({
          where: {
            OR: [
              { dedupeKey: { startsWith: tag } },
              { dedupeKey: { startsWith: `verification-code:${tag}:` } },
            ],
          },
          select: {
            status: true,
            attempts: true,
            maxAttempts: true,
            nextAttemptAt: true,
          },
        })
      : [];
    await writeRecoveryArtifact({
      timeline,
      assertions,
      passedAssertions: assertions.length,
      allPassed: assertions.length === 11,
      outbox: rows,
      mailpitReceivedCount: prisma ? await received() : null,
    });
    if (prisma) {
      await prisma.outboundEmail.deleteMany({
        where: {
          OR: [
            { dedupeKey: { startsWith: tag } },
            { dedupeKey: { startsWith: `verification-code:${tag}:` } },
          ],
        },
      });
      await prisma.emailCode.deleteMany({
        where: {
          deliveryDedupeKey: { startsWith: `verification-code:${tag}:` },
        },
      });
      mail.onModuleDestroy();
      await deliveryDb.$disconnect();
      await prisma.$disconnect();
      await databaseProxy.stop();
    }
    Object.assign(env, original);
  });

  it('recovers across the actual activity window without restart, enqueue or explicit flush', async () => {
    const baseline = await received();
    const rows = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        queue({
          status: (['PENDING', 'FAILED', 'PROCESSING'] as const)[i % 3],
          attempts: i % 3 === 0 ? 0 : 1,
          maxAttempts: 3,
          lastAttemptAt: i % 3 === 2 ? new Date(now - 700_000) : null,
          nextAttemptAt: i % 3 === 1 ? new Date(now - 1) : null,
        }),
      ),
    );
    const activityDeadline = mail.getQueueHealth().flushPollUntil;
    fault('pause');
    try {
      await mail.handleEmailQueue();
      expect(mail.getQueueHealth().consecutiveFailures).toBe(1);
      advance(31 * 60_000);
      expect(now).toBeGreaterThan(activityDeadline);
      timeline.push({
        event: 'past-actual-activity-window',
        at: now,
        activityDeadline,
      });
      await mail.handleEmailQueue();
      expect(mail.getQueueHealth().consecutiveFailures).toBe(2);
    } finally {
      fault('unpause');
    }
    const recoveredAt = now;
    let firstSuccessfulScan: number | null = null;
    for (let tick = 0; tick < 5; tick++) {
      advance(60_000);
      await mail.handleEmailQueue();
      firstSuccessfulScan ??= mail.getQueueHealth().lastSuccessfulScanAt;
      if (
        (await prisma.outboundEmail.count({
          where: { id: { in: rows.map((r) => r.id) }, status: 'SENT' },
        })) === 6
      )
        break;
    }
    expect(firstSuccessfulScan! - recoveredAt).toBeLessThanOrEqual(191_000);
    expect(now - recoveredAt).toBeLessThanOrEqual(611_000);
    timeline.push({
      event: 'first-recovered-scan',
      at: firstSuccessfulScan,
      scanElapsedApiMs: firstSuccessfulScan! - recoveredAt,
    });
    expect(await received()).toBe(baseline + 6);
    expect(
      await prisma.outboundEmail.count({
        where: { id: { in: rows.map((r) => r.id) }, status: 'SENT' },
      }),
    ).toBe(6);
    expect(mail.getQueueHealth().consecutiveFailures).toBe(0);
    expect(
      mail.getQueueHealth().lastSuccessfulScanAt! - recoveredAt,
    ).toBeLessThanOrEqual(300_000);
    timeline.push({
      event: 'all-six-received',
      at: now,
      deliveryElapsedApiMs: now - recoveredAt,
    });
    verify('cross-window PENDING FAILED stale PROCESSING multi-batch received');
  });

  it('does not exceed persisted attempt budgets, including stale leases and competing workers', async () => {
    const baseline = await received();
    const exhausted = await queue({
      status: 'PROCESSING',
      attempts: 3,
      maxAttempts: 3,
      lastAttemptAt: new Date(now - 700_000),
    });
    const live = await queue({ attempts: 0, maxAttempts: 1 });
    const other = new MailService(deliveryDb as PrismaService);
    try {
      await Promise.all([
        mail.deliverQueuedEmailNow(live.dedupeKey),
        other.deliverQueuedEmailNow(live.dedupeKey),
      ]);
    } finally {
      other.onModuleDestroy();
    }
    await mail.deliverQueuedEmailNow(exhausted.dedupeKey);
    expect(await received()).toBe(baseline + 1);
    const rows = await prisma.outboundEmail.findMany({
      where: { id: { in: [live.id, exhausted.id] } },
    });
    expect(rows.every((r) => r.attempts <= r.maxAttempts)).toBe(true);
    expect(rows.find((r) => r.id === exhausted.id)?.status).toBe('EXHAUSTED');
    verify('atomic attempt budget and multi-worker single lease');
  });

  it('exhausts the last budget after real SMTP receipt and both completion writes fail', async () => {
    timeline.push(
      await finalAttemptCompletionFault({
        prisma,
        deliveryDb,
        mail,
        tag,
        fault,
        advance,
        received,
      }),
    );
    verify(
      'final attempt real receipt then failed SENT/FAILED writes never starts SMTP again',
    );
  });

  it('converges invalid verification mail and preserves expiry/consumption, while valid code delivers', async () => {
    const baseline = await received();
    for (const state of [
      'expired',
      'consumed',
      'replaced',
      'missing',
    ] as const) {
      const f = await code(state);
      await mail.deliverQueuedEmailNow(f.row.dedupeKey);
      expect(await outboxStatus(f.row.id)).toBe('EXHAUSTED');
      if (f.record) {
        const current = await prisma.emailCode.findUniqueOrThrow({
          where: { id: f.record.id },
        });
        expect(current.expiresAt).toEqual(f.record.expiresAt);
        expect(current.consumedAt).toEqual(f.record.consumedAt);
        expect(current.deliveryStatus).toBe('EXHAUSTED');
      }
    }
    expect(await received()).toBe(baseline);
    const valid = await code('valid');
    await mail.deliverQueuedEmailNow(valid.row.dedupeKey);
    expect(await received()).toBe(baseline + 1);
    expect(
      (
        await prisma.emailCode.findUniqueOrThrow({
          where: { id: valid.record!.id },
        })
      ).deliveryStatus,
    ).toBe('SENT');
    verify(
      'invalid code no SMTP and unchanged TTL/consumption; valid code received',
    );
  });

  it('rechecks persisted code eligibility after waiting for a SMTP slot', async () => {
    const baseline = await received();
    const blocker = await queue();
    const f = await code('valid');
    await withMailRowLock(
      prisma,
      'OutboundEmail',
      blocker.id,
      async (release) => {
        const blocking = mail.deliverQueuedEmailNow(blocker.dedupeKey);
        await waitForMailRowLock(prisma, 'OutboundEmail');
        const queued = mail.deliverQueuedEmailNow(f.row.dedupeKey);
        await prisma.emailCode.update({
          where: { id: f.record!.id },
          data: { consumedAt: new Date(now) },
        });
        release();
        await Promise.all([blocking, queued]);
      },
    );
    expect(await received()).toBe(baseline + 1);
    expect(await outboxStatus(f.row.id)).toBe('EXHAUSTED');
    verify('slot wait does not retain obsolete verification eligibility');
  });

  it('rejects a code that expires while waiting for the real EmailCode row lock', async () => {
    const baseline = await received();
    const f = await code('valid');
    await withMailRowLock(
      prisma,
      'EmailCode',
      f.record!.id,
      async (release) => {
        const sending = mail.deliverQueuedEmailNow(f.row.dedupeKey);
        await waitForMailRowLock(prisma, 'EmailCode');
        advance(601_000);
        release();
        await sending;
      },
    );
    expect(await received()).toBe(baseline);
    expect(await outboxStatus(f.row.id)).toBe('EXHAUSTED');
    expect(
      (
        await prisma.emailCode.findUniqueOrThrow({
          where: { id: f.record!.id },
        })
      ).expiresAt,
    ).toEqual(f.record!.expiresAt);
    verify('held EmailCode row lock expiry is checked at fresh claim boundary');
  });

  it('honors all three runtime switches and keeps inline distinct from background', async () => {
    const baseline = await received();
    const row = await queue();
    env.BACKGROUND_JOBS_ENABLED = false;
    await mail.handleEmailQueue();
    expect(await received()).toBe(baseline);
    await mail.deliverQueuedEmailNow(row.dedupeKey);
    expect(await received()).toBe(baseline + 1);
    for (const switchName of [
      'MAIL_DELIVERY_ENABLED',
      'RELEASE_MAINTENANCE',
    ] as const) {
      const next = await queue();
      env[switchName] = switchName === 'RELEASE_MAINTENANCE';
      await mail.deliverQueuedEmailNow(next.dedupeKey);
      expect(await outboxStatus(next.id)).toBe('PENDING');
      env[switchName] = original[switchName];
      await mail.deliverQueuedEmailNow(next.dedupeKey);
    }
    env.BACKGROUND_JOBS_ENABLED = original.BACKGROUND_JOBS_ENABLED;
    verify(
      'background disabled still permits inline; mail/maintenance prevent dispatch',
    );
  });

  it('bounds database failure, caps repeated backoff and resumes normal cadence', async () => {
    const wallStart = performance.now();
    const closedBefore = databaseProxy.closedConnections();
    fault('pause');
    try {
      for (let i = 0; i < 4; i++) {
        advance(120_000);
        await mail.handleEmailQueue();
      }
      expect(performance.now() - wallStart).toBeLessThan(8000);
      await wait(20);
      expect(databaseProxy.closedConnections()).toBeGreaterThan(closedBefore);
      timeline.push({
        event: 'bounded-db-outage',
        wallElapsedMs: performance.now() - wallStart,
        destroyedConnections: databaseProxy.closedConnections() - closedBefore,
      });
      const health = mail.getQueueHealth();
      expect(health.consecutiveFailures).toBe(4);
      expect(health.nextScanRetryAt - now).toBeLessThanOrEqual(120_000);
      expect(health.backlogSample).toBeNull();
    } finally {
      fault('unpause');
    }
    advance(120_000);
    await mail.handleEmailQueue();
    expect(mail.getQueueHealth().consecutiveFailures).toBe(0);
    verify(
      'database timeout releases scanning and capped backoff clears after recovery',
    );
  });

  it('does not query an idle empty queue or refresh diagnostic samples every tick', async () => {
    advance(31 * 60_000);
    await mail.handleEmailQueue();
    const health = mail.getQueueHealth();
    for (let i = 0; i < 5; i++) {
      advance(1000);
      await mail.handleEmailQueue();
      expect(mail.getQueueHealth().lastSuccessfulScanAt).toBe(
        health.lastSuccessfulScanAt,
      );
      expect(mail.getQueueHealth().backlogSample).toEqual(health.backlogSample);
    }
    verify('idle sample and scan frequency follow fallback budget');
  });
  it('physically closes stalled SMTP sockets and releases the send slot for a later healthy delivery', async () => {
    const blackhole = await smtpBlackhole();
    const oldPort = env.SMTP_PORT;
    env.SMTP_PORT = blackhole.port;
    const bounded = new MailService(deliveryDb as PrismaService);
    try {
      const stuck = await queue();
      const start = performance.now();
      const originalWait = env.OUTBOUND_EMAIL_SEND_WAIT_TIMEOUT_MS;
      env.OUTBOUND_EMAIL_SEND_WAIT_TIMEOUT_MS = 1000;
      const sending = bounded.deliverQueuedEmailNow(stuck.dedupeKey);
      await wait(50);
      const waiting = await queue();
      await bounded.deliverQueuedEmailNow(waiting.dedupeKey);
      expect(
        (
          await prisma.outboundEmail.findUniqueOrThrow({
            where: { id: waiting.id },
          })
        ).attempts,
      ).toBe(0);
      await sending;
      env.OUTBOUND_EMAIL_SEND_WAIT_TIMEOUT_MS = originalWait;
      expect(performance.now() - start).toBeLessThan(4000);
      await wait(100);
      expect(blackhole.sockets.size).toBe(0);
      expect(await outboxStatus(stuck.id)).toBe('FAILED');
      env.SMTP_PORT = oldPort;
      const baseline = await received();
      const healthy = await queue();
      await bounded.deliverQueuedEmailNow(healthy.dedupeKey);
      await bounded.deliverQueuedEmailNow(waiting.dedupeKey);
      expect(await received()).toBe(baseline + 2);
      verify(
        'SMTP and slot deadlines destroys actual socket and later send succeeds',
      );
    } finally {
      env.SMTP_PORT = oldPort;
      env.OUTBOUND_EMAIL_SEND_WAIT_TIMEOUT_MS = 3000;
      bounded.onModuleDestroy();
      await blackhole.stop();
    }
  });

  it('does not let an old SMTP completion overwrite a newer lease', async () => {
    const oldPort = env.SMTP_PORT;
    const proxy = await smtpAckProxy(oldPort);
    env.SMTP_PORT = proxy.port;
    const worker = new MailService(deliveryDb as PrismaService);
    try {
      const row = await queue();
      const sending = worker.deliverQueuedEmailNow(row.dedupeKey);
      await proxy.ready;
      const newerLease = new Date(now + 1);
      await prisma.outboundEmail.update({
        where: { id: row.id },
        data: {
          attempts: 2,
          lastAttemptAt: newerLease,
          status: 'PROCESSING',
        },
      });
      proxy.release();
      await sending;
      const persisted = await prisma.outboundEmail.findUniqueOrThrow({
        where: { id: row.id },
      });
      expect(persisted.status).toBe('PROCESSING');
      expect(persisted.attempts).toBe(2);
      expect(persisted.lastAttemptAt).toEqual(newerLease);
      await prisma.outboundEmail.update({
        where: { id: row.id },
        data: { status: 'EXHAUSTED', nextAttemptAt: null },
      });
      verify('old real SMTP completion leaves newer lease untouched');
    } finally {
      env.SMTP_PORT = oldPort;
      worker.onModuleDestroy();
      await proxy.stop();
    }
  });
});

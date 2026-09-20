const sendMail = jest.fn();
jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: () => ({ sendMail }) },
}));

import { randomUUID } from 'crypto';
import { createPrismaClient, PrismaClient } from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DashboardSnapshotService } from '../src/common/dashboard/dashboard-snapshot.service';
import { MailService } from '../src/common/mail/mail.service';
import { queueMatchRevealEmails } from '../src/common/mail/queue-match-reveal';
import { AccountService } from '../src/modules/account/account.service';
import { CyclesService } from '../src/modules/cycles/cycles.service';
import { env } from '../src/config/env';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('Match email invalidation (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let mail: MailService;
  let account: AccountService;
  let reset: (id: string) => Promise<void>;
  const tag = `mail-match-${randomUUID()}`;
  const userIds: string[] = [];
  const matchIds: string[] = [];
  const originalConcurrency = env.SMTP_SEND_CONCURRENCY;

  beforeAll(async () => {
    const target = new URL(env.DATABASE_URL);
    if (
      !['127.0.0.1', 'localhost'].includes(target.hostname) ||
      target.port === '5432' ||
      !target.pathname.startsWith('/lilink_vip_test_')
    ) {
      throw new Error('A disposable local PostgreSQL database is required.');
    }
    prisma = createPrismaClient();
    await prisma.$connect();
    env.SMTP_SEND_CONCURRENCY = 1;
    mail = new MailService(prisma as PrismaService);
    const snapshots = new DashboardSnapshotService(prisma as PrismaService);
    account = new AccountService(
      prisma as PrismaService,
      {} as never,
      snapshots,
    );
    const cycles = new CyclesService(prisma as PrismaService, snapshots, mail);
    reset = (id) =>
      (
        cycles as unknown as {
          resetCycleForForcedRerun(id: string): Promise<void>;
        }
      ).resetCycleForForcedRerun(id);
  });
  beforeEach(() => sendMail.mockReset().mockResolvedValue(undefined));
  afterAll(async () => {
    env.SMTP_SEND_CONCURRENCY = originalConcurrency;
    if (!prisma) return;
    await prisma.outboundEmail.deleteMany({
      where: {
        OR: [
          { dedupeKey: { startsWith: tag } },
          ...matchIds.flatMap((id) => [
            { dedupeKey: { startsWith: `match-reveal:${id}:` } },
            { dedupeKey: { startsWith: `match-introduction:${id}:` } },
          ]),
        ],
      },
    });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.matchCycle.deleteMany({
      where: { codename: { startsWith: tag } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  async function fixture() {
    const users = await Promise.all(
      [0, 1].map((i) =>
        prisma.user.create({
          data: {
            email: `${randomUUID()}-${i}@example.invalid`,
            passwordHash: 'unused',
            status: 'ACTIVE',
          },
        }),
      ),
    );
    userIds.push(...users.map((u) => u.id));
    const now = new Date();
    const cycle = await prisma.matchCycle.create({
      data: {
        codename: `${tag}-${randomUUID()}`,
        status: 'REVEALED',
        participationDeadline: now,
        revealAt: now,
        participations: {
          create: users.map((u) => ({
            userId: u.id,
            status: 'OPTED_IN',
            intent: 'BOTH',
          })),
        },
      },
    });
    const match = await prisma.match.create({
      data: {
        cycleId: cycle.id,
        score: 80,
        revealedAt: now,
        participants: {
          create: users.map((u, position) => ({
            userId: u.id,
            cycleId: cycle.id,
            position,
          })),
        },
      },
    });
    matchIds.push(match.id);
    const keys = await prisma.$transaction((tx) =>
      queueMatchRevealEmails(tx, cycle.id, now, mail),
    );
    const legacy = await prisma.outboundEmail.create({
      data: {
        dedupeKey: `match-introduction:${match.id}:0`,
        recipientEmail: users[0].email,
        subject: 'Legacy introduction',
        html: '<p>Private contact</p>',
      },
    });
    keys.push(legacy.dedupeKey);
    return { users, cycle, match, keys };
  }
  async function expectCancelled(keys: string[]) {
    const rows = await prisma.outboundEmail.findMany({
      where: { dedupeKey: { in: keys } },
    });
    expect(rows).toHaveLength(keys.length);
    expect(
      rows.every(
        (row) => row.status === 'EXHAUSTED' && row.nextAttemptAt === null,
      ),
    ).toBe(true);
  }
  async function report(f: Awaited<ReturnType<typeof fixture>>) {
    await account.reportMatch(f.users[0].id, f.match.id, {
      reason: 'OTHER',
      details: 'Synthetic report',
    });
  }

  it('delivers valid current and legacy introductions', async () => {
    const f = await fixture();
    await mail.flushQueuedEmails({ dedupeKeys: f.keys });
    expect(sendMail).toHaveBeenCalledTimes(3);
    expect(
      await prisma.outboundEmail.count({
        where: { dedupeKey: { in: f.keys }, status: 'SENT' },
      }),
    ).toBe(3);
  });

  it('cancels pending, failed and processing mail transactionally on report', async () => {
    const f = await fixture();
    await prisma.outboundEmail.update({
      where: { dedupeKey: f.keys[1] },
      data: { status: 'FAILED', nextAttemptAt: new Date(0) },
    });
    await prisma.outboundEmail.update({
      where: { dedupeKey: f.keys[2] },
      data: { status: 'PROCESSING', lastAttemptAt: new Date(0) },
    });
    await report(f);
    await expectCancelled(f.keys);
    await mail.flushQueuedEmails({ dedupeKeys: f.keys });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('cancels old introductions before a forced rerun deletes the match', async () => {
    const f = await fixture();
    await reset(f.cycle.id);
    expect(
      await prisma.match.findUnique({ where: { id: f.match.id } }),
    ).toBeNull();
    await expectCancelled(f.keys);
    await mail.flushQueuedEmails({ dedupeKeys: f.keys });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it.each(['deleted', 'blocked', 'suspended', 'not-introduced'] as const)(
    'rejects historical %s matches at dispatch',
    async (state) => {
      const f = await fixture();
      if (state === 'deleted')
        await prisma.match.delete({ where: { id: f.match.id } });
      if (state === 'blocked')
        await prisma.block.create({
          data: { blockerId: f.users[0].id, blockedId: f.users[1].id },
        });
      if (state === 'suspended')
        await prisma.user.update({
          where: { id: f.users[1].id },
          data: { status: 'SUSPENDED' },
        });
      if (state === 'not-introduced')
        await prisma.match.update({
          where: { id: f.match.id },
          data: { introducedAt: null },
        });
      await mail.flushQueuedEmails({ dedupeKeys: f.keys });
      expect(sendMail).not.toHaveBeenCalled();
      await expectCancelled(f.keys);
    },
  );

  it.each(['report', 'reset'] as const)(
    'cancels an already loaded batch while it waits for a send slot: %s',
    async (action) => {
      const f = await fixture();
      const started = deferred();
      const release = deferred();
      const blocker = await prisma.outboundEmail.create({
        data: {
          dedupeKey: `${tag}-${randomUUID()}`,
          recipientEmail: 'blocker@example.invalid',
          subject: 'Blocker',
          html: 'Blocker',
          createdAt: new Date(0),
        },
      });
      sendMail.mockImplementationOnce(async () => {
        started.resolve();
        await release.promise;
      });
      const flushing = mail.flushQueuedEmails({
        dedupeKeys: [blocker.dedupeKey, ...f.keys],
      });
      await started.promise;
      try {
        if (action === 'report') await report(f);
        else await reset(f.cycle.id);
      } finally {
        release.resolve();
        await flushing;
      }
      expect(sendMail).toHaveBeenCalledTimes(1);
      await expectCancelled(f.keys);
    },
  );

  it('does not resurrect a cancelled in-flight email after SMTP failure', async () => {
    const f = await fixture();
    const started = deferred();
    const release = deferred();
    sendMail.mockImplementationOnce(async () => {
      started.resolve();
      await release.promise;
      throw new Error('Synthetic SMTP failure');
    });
    const sending = mail.deliverQueuedEmailNow(f.keys[0]);
    await started.promise;
    try {
      await report(f);
    } finally {
      release.resolve();
      await sending;
    }
    await expectCancelled(f.keys);
    await mail.flushQueuedEmails({ dedupeKeys: f.keys });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
  it('preserves sent messages and unrelated queued mail when reported', async () => {
    const f = await fixture();
    await mail.deliverQueuedEmailNow(f.keys[0]);
    const unrelated = await prisma.outboundEmail.create({
      data: {
        dedupeKey: `${tag}-${randomUUID()}`,
        recipientEmail: f.users[0].email,
        subject: 'Unrelated',
        html: 'Unrelated',
      },
    });
    await report(f);
    expect(
      (
        await prisma.outboundEmail.findUniqueOrThrow({
          where: { dedupeKey: f.keys[0] },
        })
      ).status,
    ).toBe('SENT');
    expect(
      (
        await prisma.outboundEmail.findUniqueOrThrow({
          where: { id: unrelated.id },
        })
      ).status,
    ).toBe('PENDING');
    await expectCancelled(f.keys.slice(1));
  });

  it('checks committed invalidation after waiting on the match row lock', async () => {
    const f = await fixture();
    const locked = deferred();
    const release = deferred();
    const invalidating = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Match" WHERE "id" = ${f.match.id} FOR UPDATE`;
      await tx.block.create({
        data: { blockerId: f.users[0].id, blockedId: f.users[1].id },
      });
      locked.resolve();
      await release.promise;
    });
    await locked.promise;
    const sending = mail.deliverQueuedEmailNow(f.keys[0]);
    try {
      // A separate connection observes the worker blocked on the held row lock.
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
          SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
            AND query LIKE '%FROM "Match"%FOR UPDATE%'
          ) AS waiting
        `;
        if (rows[0].waiting) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      expect(sendMail).not.toHaveBeenCalled();
    } finally {
      release.resolve();
      await invalidating;
      await sending;
    }
    expect(sendMail).not.toHaveBeenCalled();
    await expectCancelled(f.keys);
  });
});

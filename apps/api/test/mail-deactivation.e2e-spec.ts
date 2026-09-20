const sendMail = jest.fn();

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: () => ({ sendMail }) },
}));

import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { createPrismaClient, PrismaClient } from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DashboardSnapshotService } from '../src/common/dashboard/dashboard-snapshot.service';
import { MailService } from '../src/common/mail/mail.service';
import { AccountDeletionService } from '../src/modules/account/account-deletion.service';
import { PublicService } from '../src/modules/public/public.service';
import { env } from '../src/config/env';

const tag = `mail-deactivation-${randomUUID()}`;
const password = 'ReviewMail123!';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('Mail cancellation on account deactivation (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let mail: MailService;
  let deletion: AccountDeletionService;
  let passwordHash: string;
  const userIds: string[] = [];
  const emailIds: string[] = [];
  const originalConcurrency = env.SMTP_SEND_CONCURRENCY;

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
    passwordHash = await argon2.hash(password);
    env.SMTP_SEND_CONCURRENCY = 1;
    mail = new MailService(prisma as PrismaService);
    deletion = new AccountDeletionService(
      prisma as PrismaService,
      new DashboardSnapshotService(prisma as PrismaService),
      new PublicService(prisma as PrismaService),
    );
  });

  beforeEach(() => {
    sendMail.mockReset();
  });

  afterAll(async () => {
    env.SMTP_SEND_CONCURRENCY = originalConcurrency;
    await prisma.outboundEmail.deleteMany({ where: { id: { in: emailIds } } });
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.matchCycle.deleteMany({
      where: { codename: { startsWith: tag } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  async function createUser() {
    const user = await prisma.user.create({
      data: {
        email: `${tag}-${userIds.length}@example.invalid`,
        passwordHash,
        status: 'ACTIVE',
      },
    });
    userIds.push(user.id);
    return user;
  }

  async function createEmail(
    recipientEmail: string,
    dedupeKey: string,
    staleProcessing = false,
  ) {
    const email = await prisma.outboundEmail.create({
      data: {
        recipientEmail,
        dedupeKey,
        subject: 'Synthetic cancellation test',
        html: '<p>Synthetic contact</p>',
        ...(staleProcessing
          ? {
              status: 'PROCESSING' as const,
              attempts: 1,
              lastAttemptAt: new Date(Date.now() - 20 * 60_000),
            }
          : {}),
      },
    });
    emailIds.push(email.id);
    return email;
  }

  it('cancels queued legacy and match mail before a send slot opens', async () => {
    const user = await createUser();
    const counterpart = await createUser();
    const now = new Date();
    const cycle = await prisma.matchCycle.create({
      data: {
        codename: `${tag}-cycle`,
        status: 'REVEALED',
        participationDeadline: now,
        revealAt: now,
      },
    });
    const match = await prisma.match.create({
      data: {
        cycleId: cycle.id,
        score: 88,
        revealedAt: now,
        participants: {
          create: [user, counterpart].map((party, position) => ({
            userId: party.id,
            cycleId: cycle.id,
            position,
          })),
        },
      },
    });
    const blocker = await createEmail(
      'unrelated@example.invalid',
      `${tag}:blocker`,
    );
    await prisma.outboundEmail.update({
      where: { id: blocker.id },
      data: { createdAt: new Date(Date.now() - 60_000) },
    });
    const queued = [
      await createEmail(user.email, `${tag}:legacy-recipient-only`),
      await createEmail(counterpart.email, `match-reveal:${match.id}:0`),
      await createEmail(
        counterpart.email,
        `match-introduction:${match.id}:recipient`,
      ),
      await createEmail(counterpart.email, `meetup-reminder:${tag}:queued`),
      await createEmail(user.email, `${tag}:stale-processing`, true),
    ];
    const smtpStarted = deferred<void>();
    const smtpFinished = deferred<void>();
    sendMail.mockImplementationOnce(() => {
      smtpStarted.resolve();
      return smtpFinished.promise;
    });
    const flush = mail.flushQueuedEmails({
      dedupeKeys: [blocker, ...queued].map((email) => email.dedupeKey),
    });
    await smtpStarted.promise;
    try {
      expect(
        await prisma.outboundEmail.findUniqueOrThrow({
          where: { id: queued[0].id },
        }),
      ).toMatchObject({ status: 'PENDING', attempts: 0 });
      await deletion.deleteAccount(user.id, password);
    } finally {
      smtpFinished.resolve();
      await flush;
    }

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(
      await prisma.outboundEmail.count({
        where: {
          id: { in: queued.map((email) => email.id) },
          status: 'EXHAUSTED',
        },
      }),
    ).toBe(queued.length);
  });

  it.each(['PENDING', 'FAILED', 'PROCESSING'] as const)(
    'retires a legacy reminder in %s even when its recipient remains active',
    async (status) => {
      const recipient = await createUser();
      const email = await createEmail(
        recipient.email,
        `meetup-reminder:${tag}:${status}`,
      );
      await prisma.outboundEmail.update({
        where: { id: email.id },
        data: {
          status,
          nextAttemptAt: new Date(0),
          lastAttemptAt: new Date(0),
        },
      });

      await mail.deliverQueuedEmailNow(email.dedupeKey);
      await mail.flushQueuedEmails({ dedupeKeys: [email.dedupeKey] });

      expect(sendMail).not.toHaveBeenCalled();
      expect(
        await prisma.outboundEmail.findUniqueOrThrow({
          where: { id: email.id },
        }),
      ).toMatchObject({
        status: 'EXHAUSTED',
        attempts: 0,
        nextAttemptAt: null,
        errorMessage: 'Meetup workflow retired before delivery.',
      });
    },
  );

  it.each(['success', 'failure'] as const)(
    'does not overwrite cancellation after an in-flight SMTP %s',
    async (outcome) => {
      const user = await createUser();
      const email = await createEmail(user.email, `${tag}:inflight-${outcome}`);
      const smtpStarted = deferred<void>();
      const smtpFinished = deferred<void>();
      sendMail.mockImplementationOnce(() => {
        smtpStarted.resolve();
        return smtpFinished.promise;
      });
      const delivery = mail.deliverQueuedEmailNow(email.dedupeKey);
      await smtpStarted.promise;
      try {
        await deletion.deleteAccount(user.id, password);
      } finally {
        if (outcome === 'success') smtpFinished.resolve();
        else smtpFinished.reject(new Error('Synthetic SMTP failure'));
        await delivery;
      }

      expect(
        await prisma.outboundEmail.findUniqueOrThrow({
          where: { id: email.id },
        }),
      ).toMatchObject({
        status: 'EXHAUSTED',
        attempts: 1,
        nextAttemptAt: null,
        errorMessage: 'Account deactivated before delivery.',
      });
      await mail.flushQueuedEmails({ dedupeKeys: [email.dedupeKey] });
      expect(sendMail).toHaveBeenCalledTimes(1);
    },
  );
});

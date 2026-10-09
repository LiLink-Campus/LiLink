import { createCycleServices } from './fixtures/cycles';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as argon2 from 'argon2';
import { DashboardSnapshotService } from '../src/common/dashboard/dashboard-snapshot.service';
import { MailService } from '../src/common/mail/mail.service';
import { createPrismaClient, PrismaClient } from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { AccountDeletionService } from '../src/modules/account/account-deletion.service';
import { PublicService } from '../src/modules/public/public.service';

// Failure boundary: account deletion holds a match while reveal changes the
// cycle first. Public invalidation must not introduce a lock cycle between these
// business writes. Both commits must survive, preserve privacy, and queue work.
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out: ${label}`)),
          5000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe('Public cache business concurrency (isolated PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    const database = new URL(process.env.DATABASE_URL!);
    if (
      !['127.0.0.1', 'localhost'].includes(database.hostname) ||
      !database.port ||
      database.port === '5432' ||
      !database.pathname.startsWith('/lilink_vip_test_')
    ) {
      throw new Error(
        'Use the isolated API E2E runner and disposable database',
      );
    }
    prisma = createPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('commits concurrent account deletion and cycle reveal without a cache lock deadlock', async () => {
    const password = 'SyntheticCacheReview123!';
    const passwordHash = await argon2.hash(password);
    const users = await Promise.all(
      [0, 1].map(() =>
        prisma.user.create({
          data: {
            email: `cache-concurrency-${randomUUID()}@example.test`,
            passwordHash,
            status: 'ACTIVE',
            isTest: false,
          },
        }),
      ),
    );
    const cycle = await prisma.matchCycle.create({
      data: {
        codename: `cache-concurrency-${randomUUID()}`,
        status: 'REVEAL_READY',
        participationDeadline: new Date(Date.now() - 120_000),
        revealAt: new Date(Date.now() - 60_000),
        participations: {
          create: users.map((user) => ({
            userId: user.id,
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
        participants: {
          create: users.map((user, position) => ({
            userId: user.id,
            cycleId: cycle.id,
            position,
          })),
        },
      },
    });
    const queueBefore = await prisma.publicCacheInvalidation.findUniqueOrThrow({
      where: { scope: 'home' },
    });
    const deletionHasMatchLock = gate();
    const revealHasCycleLock = gate();
    const order: string[] = [];
    const deletingClient = prisma.$extends({
      query: {
        user: {
          async update({ args, query }) {
            if (args.where.id === users[0].id && args.data.deactivatedAt) {
              order.push('deletion acquired business locks');
              deletionHasMatchLock.release();
              await bounded(revealHasCycleLock.promise, 'reveal cycle lock');
            }
            return query(args);
          },
        },
      },
    });
    const revealingClient = prisma.$extends({
      query: {
        matchCycle: {
          async updateMany({ args, query }) {
            const result = await query(args);
            if (args.data.status === 'REVEALED') {
              order.push('reveal updated cycle');
              revealHasCycleLock.release();
            }
            return result;
          },
        },
      },
    });
    const snapshots = new DashboardSnapshotService(prisma as PrismaService);
    const deletion = new AccountDeletionService(
      deletingClient as unknown as PrismaService,
      snapshots,
      new PublicService(prisma as PrismaService),
    );
    const cycles = createCycleServices(
      revealingClient as unknown as PrismaService,
      snapshots,
      new MailService(prisma as PrismaService),
    ).cycles;
    const deleting = deletion.deleteAccount(users[0].id, password);
    const deletionResult = deleting.then(
      (value) => ({ status: 'fulfilled', value }),
      () => ({ status: 'rejected' }),
    );
    const evidence = {
      isolation:
        'Disposable PostgreSQL with real migrations and service transactions',
      command:
        'node scripts/e2e/run.mjs --api public-cache-concurrency.e2e-spec.ts',
      order,
      outcomes: [] as string[],
      assertions: {
        bothBusinessTransactionsCommitted: false,
        deactivationPreserved: false,
        revealCommittedWithoutSharingDeletedContact: false,
        bothPublicChangesQueued: false,
      },
    };
    let revealResult: { status: string } | undefined;
    try {
      await bounded(deletionHasMatchLock.promise, 'deletion match lock');
      revealResult = await cycles.runRevealCycle({ cycleId: cycle.id }).then(
        (value) => ({ status: 'fulfilled', value }),
        () => ({ status: 'rejected' }),
      );
      const outcomes = [await deletionResult, revealResult];
      evidence.outcomes = outcomes.map((result) => result.status);
      expect(outcomes.map((result) => result.status)).toEqual([
        'fulfilled',
        'fulfilled',
      ]);
      evidence.assertions.bothBusinessTransactionsCommitted = true;
      const [savedUser, savedCycle, savedMatch, queueAfter] = await Promise.all(
        [
          prisma.user.findUniqueOrThrow({ where: { id: users[0].id } }),
          prisma.matchCycle.findUniqueOrThrow({ where: { id: cycle.id } }),
          prisma.match.findUniqueOrThrow({ where: { id: match.id } }),
          prisma.publicCacheInvalidation.findUniqueOrThrow({
            where: { scope: 'home' },
          }),
        ],
      );
      expect(savedUser.status).toBe('SUSPENDED');
      expect(savedUser.deactivatedAt).not.toBeNull();
      evidence.assertions.deactivationPreserved = true;
      expect(savedCycle.status).toBe('REVEALED');
      expect(savedMatch.revealedAt).not.toBeNull();
      expect(savedMatch.introducedAt).toBeNull();
      expect(
        await prisma.outboundEmail.count({
          where: { dedupeKey: { startsWith: `match-reveal:${match.id}:` } },
        }),
      ).toBe(0);
      evidence.assertions.revealCommittedWithoutSharingDeletedContact = true;
      expect(queueAfter.revision >= queueBefore.revision + 2n).toBe(true);
      evidence.assertions.bothPublicChangesQueued = true;
    } finally {
      revealHasCycleLock.release();
      await deletionResult;
      if (process.env.E2E_OUTPUT) {
        await writeFile(
          path.join(process.env.E2E_OUTPUT, 'public-cache-concurrency.json'),
          JSON.stringify(evidence, null, 2),
        );
      }
      await prisma.matchCycle.delete({ where: { id: cycle.id } });
      await prisma.user.deleteMany({
        where: { id: { in: users.map((user) => user.id) } },
      });
    }
  }, 20_000);
});

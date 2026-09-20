import { randomBytes, randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaClient } from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { hashVipCode, VipService } from '../src/modules/vip/vip.service';
import { revokeVipCodes } from '../src/modules/vip/vip-revocation';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function waitFor(promise: Promise<void>, label: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Timed out: ${label}`)),
          3000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const batch = `vip-revocation-race-${randomUUID()}`;

describe('Concurrent VIP revocations (isolated PostgreSQL)', () => {
  let prisma: PrismaClient;
  let userId: string | undefined;

  beforeAll(async () => {
    const database = new URL(process.env.DATABASE_URL!);
    if (
      !['127.0.0.1', 'localhost'].includes(database.hostname) ||
      !database.pathname.startsWith('/lilink_vip_test_')
    ) {
      throw new Error('Dedicated local VIP test database required');
    }
    prisma = createPrismaClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.vipActivation.deleteMany({ where: { batch } });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            ...(userId ? [{ actorId: userId }] : []),
            {
              action: 'VIP_CODES_REVOKED',
              metadata: { path: ['batch'], equals: batch },
            },
          ],
        },
      });
      if (userId) await prisma.user.delete({ where: { id: userId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  it('releases a newly owned renewal before waiting on another revocation target', async () => {
    const account = await prisma.user.create({
      data: {
        email: `${batch}@example.invalid`,
        passwordHash: 'synthetic-unusable',
        status: 'ACTIVE',
      },
    });
    userId = account.id;
    const first = randomBytes(12).toString('hex').toUpperCase();
    const renewal = randomBytes(12).toString('hex').toUpperCase();
    // Row lock order intentionally reverses the cards' entitlement order.
    const firstId = `z-${batch}`;
    const renewalId = `a-${batch}`;
    await prisma.vipActivation.createMany({
      data: [
        { id: firstId, codeHash: hashVipCode(first), batch },
        { id: renewalId, codeHash: hashVipCode(renewal), batch },
      ],
    });

    const discoveredUnused = gate();
    const allowSecondLocks = gate();
    const firstLocked = gate();
    const renewalLocked = gate();
    const updatingRenewal = gate();
    const gates = [
      discoveredUnused,
      allowSecondLocks,
      firstLocked,
      renewalLocked,
      updatingRenewal,
    ];
    const pending: Promise<unknown>[] = [];
    const track = <T>(operation: Promise<T>) => {
      pending.push(operation);
      void operation.catch(() => undefined);
      return operation;
    };
    const events: string[] = [];
    let discoveries = 0;
    let firstRenewalLock = true;

    const secondClient = prisma.$extends({
      query: {
        vipActivation: {
          async findMany({ args, query }) {
            const result = await query(args);
            if (args.select?.userId && args.where?.batch === batch) {
              discoveries += 1;
              if (discoveries === 1) {
                expect(result).toHaveLength(2);
                expect(result.every((code) => code.userId === null)).toBe(true);
                events.push('second-discovered-unused');
                discoveredUnused.release();
                await waitFor(allowSecondLocks.promise, 'allow second locks');
              } else {
                events.push('second-retried');
              }
            }
            return result;
          },
        },
        async $queryRaw({ args, query }) {
          const result: unknown = await query(args);
          const rows = result as { id: string; userId?: string | null }[];
          if (
            firstRenewalLock &&
            rows.some((row) => row.id === renewalId && row.userId === userId)
          ) {
            firstRenewalLock = false;
            events.push('second-locked-renewal');
            renewalLocked.release();
            await waitFor(updatingRenewal.promise, 'first updates renewal');
          }
          return result;
        },
      },
    });
    const firstClient = prisma.$extends({
      query: {
        vipActivation: {
          async update({ args, query }) {
            if (args.where.id === renewalId) {
              events.push('first-updating-renewal');
              updatingRenewal.release();
            }
            return query(args);
          },
        },
        async $queryRaw({ args, query }) {
          const result: unknown = await query(args);
          const rows = result as { id: string; userId?: string | null }[];
          if (rows.some((row) => row.id === firstId && row.userId === userId)) {
            events.push('first-locked-first');
            firstLocked.release();
            await waitFor(renewalLocked.promise, 'second locks renewal');
          }
          return result;
        },
      },
    });

    try {
      const secondRevocation = track(
        revokeVipCodes(secondClient as unknown as PrismaClient, {
          batch,
          hashes: [hashVipCode(first), hashVipCode(renewal)],
        }),
      );
      await waitFor(discoveredUnused.promise, 'second discovers unused codes');
      const vip = new VipService(prisma as PrismaService);
      await vip.activate(userId, first);
      await vip.activate(userId, renewal);
      events.push('codes-activated');

      const firstRevocation = track(
        revokeVipCodes(firstClient as unknown as PrismaClient, {
          batch,
          hashes: [hashVipCode(first)],
        }),
      );
      await waitFor(firstLocked.promise, 'first locks user and first card');
      allowSecondLocks.release();

      await expect(
        Promise.all([firstRevocation, secondRevocation]),
      ).resolves.toEqual([{ count: 1 }, { count: 1 }]);
      expect(discoveries).toBe(2);
      expect(events).toEqual([
        'second-discovered-unused',
        'codes-activated',
        'first-locked-first',
        'second-locked-renewal',
        'first-updating-renewal',
        'second-retried',
      ]);
      expect((await vip.getStatus(userId)).active).toBe(false);
      expect(
        await prisma.vipActivation.count({ where: { batch, revokedAt: null } }),
      ).toBe(0);
      expect(
        await prisma.auditLog.count({
          where: {
            action: 'VIP_CODES_REVOKED',
            metadata: { path: ['batch'], equals: batch },
          },
        }),
      ).toBe(2);
    } finally {
      for (const barrier of gates) barrier.release();
      await Promise.allSettled(pending);
    }
  }, 15000);
});

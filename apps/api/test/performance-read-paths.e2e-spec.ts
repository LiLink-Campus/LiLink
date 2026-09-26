import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaClient } from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { ActivationService } from '../src/modules/activation/activation.service';
import { CouponService } from '../src/modules/coupon/coupon.service';
import { DashboardSnapshotService } from '../src/common/dashboard/dashboard-snapshot.service';

// Failure boundaries: completed rewards must not queue behind publication;
// first grants must still serialize with campaign end; lazy repairs must not
// materialize unrelated users or change existing snapshots.
function barrier() {
  let resolve!: () => void;
  const promise = new Promise<void>((release) => {
    resolve = release;
  });
  return { promise, resolve };
}

describe('Bounded performance read paths (PostgreSQL)', () => {
  const tag = `read-paths-${randomUUID()}`;
  let prisma: PrismaClient;
  let coupons: CouponService;
  let snapshots: DashboardSnapshotService;
  let campaignId: string;
  let versionId: string;
  const users: string[] = [];

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.$connect();
    const client = prisma as PrismaService;
    coupons = new CouponService(client, new ActivationService(client));
    snapshots = new DashboardSnapshotService(client);
    versionId = (
      await prisma.questionnaireVersion.create({ data: { title: tag } })
    ).id;
    for (let n = 0; n < 3; n++) {
      users.push(
        (
          await prisma.user.create({
            data: {
              email: `${n}-${tag}@example.test`,
              passwordHash: 'unused',
              status: 'ACTIVE',
              firstOptedInAt: new Date(),
              questionnaireResponse: {
                create: {
                  versionId,
                  answers: {},
                  submittedAt: new Date(),
                },
              },
            },
          })
        ).id,
      );
    }
    campaignId = (
      await prisma.campaign.create({
        data: {
          name: tag,
          slug: tag,
          status: 'ACTIVE',
          couponTemplates: {
            create: {
              title: tag,
              benefitType: 'CUSTOM',
              faceValue: 100,
              merchant: { create: { name: tag } },
            },
          },
        },
      })
    ).id;
  });
  afterAll(async () => {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'ENDED' },
    });
    await prisma.$disconnect();
  });

  it('returns an already-granted coupon while publication holds the global lock', async () => {
    expect((await coupons.getMyCoupons(users[0])).items).toHaveLength(1);
    const locked = barrier();
    const release = barrier();
    const holder = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(70412026)`;
      locked.resolve();
      await release.promise;
    });
    let read: ReturnType<CouponService['getMyCoupons']> | undefined;
    let timer: NodeJS.Timeout | undefined;
    try {
      await locked.promise;
      read = coupons.getMyCoupons(users[0]);
      const result = await Promise.race([
        read,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(new Error('Completed grant waited for publication lock')),
            1500,
          );
        }),
      ]);
      expect(result.items).toHaveLength(1);
    } finally {
      clearTimeout(timer);
      release.resolve();
      await holder;
      await read;
    }
    expect(await prisma.coupon.count({ where: { userId: users[0] } })).toBe(1);
  });

  it('allows distinct first-time recipients concurrently and grants each template once', async () => {
    const inserted = barrier();
    const release = barrier();
    const client = prisma.$extends({
      query: {
        coupon: {
          async create({ args, query }) {
            const result = await query(args);
            if (args.data.userId === users[1]) {
              inserted.resolve();
              await release.promise;
            }
            return result;
          },
        },
      },
    });
    const service = new CouponService(
      client as unknown as PrismaService,
      new ActivationService(client as unknown as PrismaService),
    );
    const first = service.getMyCoupons(users[1]);
    let repeated: Promise<unknown>[] = [];
    let other: ReturnType<CouponService['getMyCoupons']> | undefined;
    let timer: NodeJS.Timeout | undefined;
    try {
      await inserted.promise;
      repeated = Array.from({ length: 8 }, () =>
        service.getMyCoupons(users[1]),
      );
      other = service.getMyCoupons(users[2]);
      const result = await Promise.race([
        other,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error('Unrelated grant blocked behind another recipient'),
              ),
            1500,
          );
        }),
      ]);
      expect(result.items).toHaveLength(1);
    } finally {
      clearTimeout(timer);
      release.resolve();
      await Promise.all([first, other, ...repeated]);
    }
    await Promise.all(
      Array.from({ length: 8 }, () => coupons.getMyCoupons(users[1])),
    );
    expect(await prisma.coupon.count({ where: { userId: users[1] } })).toBe(1);
    // A fresh activity gives both previously qualified users a new reward.
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: 'ENDED' },
    });
    campaignId = (
      await prisma.campaign.create({
        data: {
          name: tag,
          slug: `${tag}-next`,
          status: 'ACTIVE',
          couponTemplates: {
            create: {
              title: tag,
              benefitType: 'CUSTOM',
              faceValue: 100,
              merchant: { create: { name: tag } },
            },
          },
        },
      })
    ).id;
  });

  it('does not grant a first reward after a concurrent campaign end commits', async () => {
    const locked = barrier();
    const release = barrier();
    const activityRead = barrier();
    const client = prisma.$extends({
      query: {
        campaign: {
          async findMany({ args, query }) {
            const result = await query(args);
            activityRead.resolve();
            return result;
          },
        },
      },
    });
    const service = new CouponService(
      client as unknown as PrismaService,
      new ActivationService(client as unknown as PrismaService),
    );
    const holder = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(70412026)`;
      await tx.campaign.update({
        where: { id: campaignId },
        data: { status: 'ENDED' },
      });
      locked.resolve();
      await release.promise;
    });
    try {
      await locked.promise;
      const read = service.getMyCoupons(users[1]);
      await activityRead.promise;
      release.resolve();
      await holder;
      expect((await read).items).toHaveLength(1);
    } finally {
      release.resolve();
      await holder;
    }
    expect(
      await prisma.campaignActivation.count({
        where: { userId: users[1], campaignId },
      }),
    ).toBe(0);
  });

  it('repairs only the requested participant and coalesces concurrent reads', async () => {
    const cycle = await prisma.matchCycle.create({
      data: {
        codename: tag,
        status: 'REVEALED',
        participationDeadline: new Date(),
        revealAt: new Date(),
        participations: {
          create: users.map((userId) => ({
            userId,
            status: 'OPTED_IN' as const,
          })),
        },
      },
    });
    await Promise.all(
      Array.from({ length: 10 }, () =>
        snapshots.ensureUserSnapshotCoverage({
          userId: users[0],
          recentRevealedCycleIds: [cycle.id],
          existingSnapshotCycleIds: [],
        }),
      ),
    );
    const rows = await prisma.userCycleDashboardSnapshot.findMany({
      where: { cycleId: cycle.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: users[0],
      result: 'UNMATCHED',
      visibility: 'NOT_APPLICABLE',
    });
    await snapshots.syncCycleSnapshots(cycle.id);
    expect(
      await prisma.userCycleDashboardSnapshot.count({
        where: { cycleId: cycle.id },
      }),
    ).toBe(3);
  });
});

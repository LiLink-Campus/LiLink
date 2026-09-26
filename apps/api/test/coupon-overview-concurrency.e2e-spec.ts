import { randomUUID } from 'node:crypto';
import { createPrismaClient, PrismaClient } from '../src/common/prisma/client';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { CouponService } from '../src/modules/coupon/coupon.service';

// Failure boundaries: redemption between partition reads must neither duplicate
// nor hide a coupon; a subsequent overview must reflect the committed redemption.
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
          3000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe('Coupon overview consistency (isolated PostgreSQL)', () => {
  let prisma: PrismaClient;
  let writer: PrismaClient;
  let templateId: string;
  let merchantId: string;

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
    writer = createPrismaClient();
    await Promise.all([prisma.$connect(), writer.$connect()]);
    const tag = `coupon-overview-${randomUUID()}`;
    const template = await prisma.couponTemplate.create({
      data: {
        title: tag,
        faceValue: 100,
        benefitType: 'CUSTOM',
        campaign: { create: { name: tag, slug: tag, status: 'ENDED' } },
        merchant: { create: { name: tag } },
      },
    });
    templateId = template.id;
    merchantId = template.merchantId;
  });

  afterAll(async () => {
    await Promise.all([prisma?.$disconnect(), writer?.$disconnect()]);
    // The runner destroys the entire disposable database after this suite.
  });

  it.each(['available', 'history'] as const)(
    'keeps one coupon when %s is read before redemption commits',
    async (firstPartition) => {
      const user = await prisma.user.create({
        data: {
          email: `overview-${randomUUID()}@example.test`,
          passwordHash: 'synthetic-unused-hash',
          status: 'ACTIVE',
          isTest: true,
        },
      });
      const coupon = await prisma.coupon.create({
        data: { userId: user.id, templateId, code: randomUUID() },
      });
      const firstRead = gate();
      const committed = gate();
      const order: string[] = [];
      const client = prisma.$extends({
        query: {
          coupon: {
            async findMany({ args, query }) {
              const partition = JSON.stringify(args.where).includes(
                '"not":"ISSUED"',
              )
                ? 'history'
                : 'available';
              if (partition !== firstPartition) {
                await bounded(committed.promise, 'redemption commit');
              }
              const rows = await query(args);
              order.push(`${partition} read`);
              if (partition === firstPartition) firstRead.release();
              return rows;
            },
          },
        },
      });
      const service = new CouponService(client as unknown as PrismaService);
      const read = service.getMyCouponOverview(user.id);
      // Attach a rejection handler immediately while the writer is scheduled.
      const settled = read.then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
      try {
        await bounded(firstRead.promise, 'first partition read');
        await writer.$transaction(async (tx) => {
          await tx.coupon.update({
            where: { id: coupon.id },
            data: { status: 'REDEEMED' },
          });
          await tx.redemption.create({
            data: {
              couponId: coupon.id,
              merchantId,
              userId: user.id,
              faceValueSnapshot: 100,
            },
          });
        });
        order.push('redemption committed');
        committed.release();
        const overview = await bounded(read, 'overview completion');
        expect(order).toEqual([
          `${firstPartition} read`,
          'redemption committed',
          `${firstPartition === 'available' ? 'history' : 'available'} read`,
        ]);
        const occurrences = [
          ...overview.available.items,
          ...overview.history.items,
        ].filter((item) => item.id === coupon.id);
        expect(occurrences).toHaveLength(1);
        expect(overview.available.items).toEqual([
          expect.objectContaining({
            id: coupon.id,
            status: 'ISSUED',
            redeemedAt: null,
          }),
        ]);
        expect(overview.history.items).toEqual([]);
        const refreshed = await new CouponService(
          prisma as PrismaService,
        ).getMyCouponOverview(user.id);
        expect(refreshed.available.items).toEqual([]);
        expect(refreshed.history.items).toEqual([
          expect.objectContaining({
            id: coupon.id,
            status: 'REDEEMED',
          }),
        ]);
        expect(typeof refreshed.history.items[0].redeemedAt).toBe('string');
      } finally {
        committed.release();
        await settled;
      }
    },
    15000,
  );
});

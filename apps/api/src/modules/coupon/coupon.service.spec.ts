import {
  DASHBOARD_COUPON_READ_TARGET,
  DASHBOARD_COUPON_READ_VERSION,
} from '@lilink/shared';
import { CouponService } from './coupon.service';
import { DASHBOARD_COUPON_HREF } from './coupon-read-state';

const ANY_DATE = expect.any(Date) as unknown as Date;

function makePrisma() {
  return {
    coupon: { findMany: jest.fn(), count: jest.fn() },
    couponReadState: { findUnique: jest.fn(), upsert: jest.fn() },
  };
}

function couponRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'co1',
    code: 'ABCDEFGHJK',
    status: 'ISSUED',
    issuedAt: new Date('2026-05-01T00:00:00.000Z'),
    expiresAt: null,
    template: {
      title: '满50减10',
      description: null,
      benefitType: 'FULL_REDUCTION',
      faceValue: 1000,
      rule: null,
      merchant: { id: 'm1', name: 'Cafe' },
    },
    redemption: null,
    ...overrides,
  };
}

describe('CouponService.getMyCoupons', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns issued coupons with the code, benefit text, and merchant', async () => {
    const prisma = makePrisma();
    prisma.coupon.findMany.mockResolvedValue([couponRow()]);
    const service = new CouponService(prisma as never);

    const result = await service.getMyCoupons('u1');

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'co1',
        code: 'ABCDEFGHJK',
        status: 'ISSUED',
        merchantName: 'Cafe',
        title: '满50减10',
        benefitType: 'FULL_REDUCTION',
        benefitText: '满50减10',
        faceValue: 1000,
        redeemedAt: null,
      }),
    );
  });

  it('reports an ISSUED coupon past its expiry as EXPIRED', async () => {
    const prisma = makePrisma();
    prisma.coupon.findMany.mockResolvedValue([
      couponRow({ expiresAt: new Date('2020-01-01T00:00:00.000Z') }),
    ]);
    const service = new CouponService(prisma as never);

    const result = await service.getMyCoupons('u1');

    expect(result.items[0].status).toBe('EXPIRED');
  });

  it('keeps a future expiry as ISSUED', async () => {
    const prisma = makePrisma();
    prisma.coupon.findMany.mockResolvedValue([
      couponRow({ expiresAt: new Date(Date.now() + 86_400_000) }),
    ]);
    const service = new CouponService(prisma as never);

    const result = await service.getMyCoupons('u1');

    expect(result.items[0].status).toBe('ISSUED');
  });

  it('surfaces the redemption time for REDEEMED coupons', async () => {
    const prisma = makePrisma();
    const redeemedAt = new Date('2026-05-10T00:00:00.000Z');
    prisma.coupon.findMany.mockResolvedValue([
      couponRow({ status: 'REDEEMED', redemption: { redeemedAt } }),
    ]);
    const service = new CouponService(prisma as never);

    const result = await service.getMyCoupons('u1');

    expect(result.items[0].status).toBe('REDEEMED');
    expect(result.items[0].redeemedAt).toBe(redeemedAt.toISOString());
  });

  it('returns an empty list when the user has no coupons', async () => {
    const prisma = makePrisma();
    prisma.coupon.findMany.mockResolvedValue([]);
    const service = new CouponService(prisma as never);

    const result = await service.getMyCoupons('u1');

    expect(result.items).toEqual([]);
  });
});

describe('CouponService coupon read state', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns unread dashboard coupon agenda with the currently usable ISSUED count', async () => {
    const prisma = makePrisma();
    prisma.coupon.count.mockResolvedValue(2);
    prisma.couponReadState.findUnique.mockResolvedValue(null);
    const service = new CouponService(prisma as never);

    const result = await service.getMyCouponReadState('u1');

    expect(result).toEqual({
      target: DASHBOARD_COUPON_READ_TARGET,
      version: DASHBOARD_COUPON_READ_VERSION,
      availableCount: 2,
      unreadAvailableCount: 2,
      read: false,
      readAt: null,
      href: DASHBOARD_COUPON_HREF,
    });
    expect(prisma.coupon.count).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        status: 'ISSUED',
        totpSecret: { not: null },
        OR: [{ expiresAt: null }, { expiresAt: { gt: ANY_DATE } }],
      },
    });
  });

  it('excludes legacy issued coupons without a redeem secret from the agenda query', async () => {
    const prisma = makePrisma();
    prisma.coupon.count.mockResolvedValue(0);
    prisma.couponReadState.findUnique.mockResolvedValue(null);
    const service = new CouponService(prisma as never);

    const result = await service.getMyCouponReadState('u1');

    expect(result.availableCount).toBe(0);
    expect(result.unreadAvailableCount).toBe(0);
    expect(prisma.coupon.count).toHaveBeenCalledWith({
      where: {
        userId: 'u1',
        status: 'ISSUED',
        totpSecret: { not: null },
        OR: [{ expiresAt: null }, { expiresAt: { gt: ANY_DATE } }],
      },
    });
  });

  it('returns zero unread available coupons after the current target/version is read', async () => {
    const readAt = new Date('2026-05-10T00:00:00.000Z');
    const prisma = makePrisma();
    prisma.coupon.count.mockResolvedValue(3);
    prisma.couponReadState.findUnique.mockResolvedValue({ readAt });
    const service = new CouponService(prisma as never);

    const result = await service.getMyCouponReadState('u1');

    expect(result).toMatchObject({
      availableCount: 3,
      unreadAvailableCount: 0,
      read: true,
      readAt: readAt.toISOString(),
    });
  });

  it('marks the current dashboard coupon target/version read idempotently', async () => {
    const readAt = new Date('2026-05-10T00:00:00.000Z');
    const prisma = makePrisma();
    prisma.coupon.count.mockResolvedValue(1);
    prisma.couponReadState.upsert.mockResolvedValue({ readAt });
    const service = new CouponService(prisma as never);

    const first = await service.markMyCouponRead('u1');
    const second = await service.markMyCouponRead('u1');

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      availableCount: 1,
      unreadAvailableCount: 0,
      read: true,
      readAt: readAt.toISOString(),
    });
    expect(prisma.couponReadState.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.couponReadState.upsert).toHaveBeenCalledWith({
      where: {
        userId_target_version: {
          userId: 'u1',
          target: DASHBOARD_COUPON_READ_TARGET,
          version: DASHBOARD_COUPON_READ_VERSION,
        },
      },
      create: {
        userId: 'u1',
        target: DASHBOARD_COUPON_READ_TARGET,
        version: DASHBOARD_COUPON_READ_VERSION,
        readAt: ANY_DATE,
      },
      update: {},
      select: { readAt: true },
    });
  });
});

import { CouponService } from './coupon.service';

function makePrisma() {
  return { coupon: { findMany: jest.fn() } };
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

import { NotFoundException } from '@nestjs/common';
import { CouponUserService } from './coupon-user.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePrisma() {
  return {
    coupon: { findUnique: jest.fn() },
  };
}

const FUTURE = new Date(Date.now() + 86_400_000);
const PAST = new Date('2020-01-01T00:00:00.000Z');

function issuedCoupon(overrides: Record<string, unknown> = {}) {
  return {
    id: 'co1',
    userId: 'u1',
    code: 'ABCDEFGHJK',
    status: 'ISSUED',
    expiresAt: null,
    totpSecret: 'BASE32SECRET',
    redemption: null,
    template: {
      templateId: 'tpl1',
      merchantId: 'm1',
      merchant: {
        id: 'm1',
        promotionBlocks: null,
      },
    },
    ...overrides,
  };
}

function redeemedCoupon(overrides: Record<string, unknown> = {}) {
  return {
    id: 'co1',
    userId: 'u1',
    code: 'ABCDEFGHJK',
    status: 'REDEEMED',
    expiresAt: null,
    totpSecret: 'BASE32SECRET',
    redemption: {
      orderAmount: 5000,
      actualDiscountAmount: 1000,
      giftLabel: null,
      redeemedAt: new Date('2026-05-10T12:00:00.000Z'),
      merchantId: 'm1',
      merchant: {
        id: 'm1',
        promotionBlocks: [{ type: 'TEXT', text: 'Follow our WeChat!' }],
      },
    },
    template: {
      templateId: 'tpl1',
      merchantId: 'm1',
      merchant: {
        id: 'm1',
        promotionBlocks: [{ type: 'TEXT', text: 'Follow our WeChat!' }],
      },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests: getRedeemSecret
// ---------------------------------------------------------------------------

describe('CouponUserService.getRedeemSecret', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns code, secret, period, and digits for an ISSUED coupon owned by the caller', async () => {
    const prisma = makePrisma();
    prisma.coupon.findUnique.mockResolvedValue(issuedCoupon());
    const service = new CouponUserService(prisma as never);

    const result = await service.getRedeemSecret('u1', 'co1');

    expect(result).toEqual({
      code: 'ABCDEFGHJK',
      secret: 'BASE32SECRET',
      period: 60,
      digits: 6,
    });
  });

  it('throws NotFoundException when the coupon belongs to a different user', async () => {
    const prisma = makePrisma();
    // findUnique returns null when userId + id don't match — simulate ownership miss
    prisma.coupon.findUnique.mockResolvedValue(null);
    const service = new CouponUserService(prisma as never);

    await expect(service.getRedeemSecret('u1', 'co1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException for a REDEEMED coupon', async () => {
    const prisma = makePrisma();
    prisma.coupon.findUnique.mockResolvedValue(
      issuedCoupon({ status: 'REDEEMED' }),
    );
    const service = new CouponUserService(prisma as never);

    await expect(service.getRedeemSecret('u1', 'co1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException for a VOID coupon', async () => {
    const prisma = makePrisma();
    prisma.coupon.findUnique.mockResolvedValue(
      issuedCoupon({ status: 'VOID' }),
    );
    const service = new CouponUserService(prisma as never);

    await expect(service.getRedeemSecret('u1', 'co1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when the coupon is ISSUED but expired', async () => {
    const prisma = makePrisma();
    prisma.coupon.findUnique.mockResolvedValue(
      issuedCoupon({ expiresAt: PAST }),
    );
    const service = new CouponUserService(prisma as never);

    await expect(service.getRedeemSecret('u1', 'co1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException when totpSecret is null (legacy coupon)', async () => {
    const prisma = makePrisma();
    prisma.coupon.findUnique.mockResolvedValue(
      issuedCoupon({ totpSecret: null }),
    );
    const service = new CouponUserService(prisma as never);

    await expect(service.getRedeemSecret('u1', 'co1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('still returns the secret when the coupon is ISSUED and has a future expiry', async () => {
    const prisma = makePrisma();
    prisma.coupon.findUnique.mockResolvedValue(
      issuedCoupon({ expiresAt: FUTURE }),
    );
    const service = new CouponUserService(prisma as never);

    const result = await service.getRedeemSecret('u1', 'co1');

    expect(result.secret).toBe('BASE32SECRET');
  });
});

// ---------------------------------------------------------------------------
// Tests: getCouponStatus
// ---------------------------------------------------------------------------

describe('CouponUserService.getCouponStatus', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns just status for an ISSUED coupon', async () => {
    const prisma = makePrisma();
    prisma.coupon.findUnique.mockResolvedValue(issuedCoupon());
    const service = new CouponUserService(prisma as never);

    const result = await service.getCouponStatus('u1', 'co1');

    expect(result).toEqual({ status: 'ISSUED' });
  });

  it('returns status ISSUED for an ISSUED coupon with a future expiry', async () => {
    const prisma = makePrisma();
    prisma.coupon.findUnique.mockResolvedValue(
      issuedCoupon({ expiresAt: FUTURE }),
    );
    const service = new CouponUserService(prisma as never);

    const result = await service.getCouponStatus('u1', 'co1');

    expect(result.status).toBe('ISSUED');
  });

  it('returns status EXPIRED for an ISSUED coupon past its expiry', async () => {
    const prisma = makePrisma();
    prisma.coupon.findUnique.mockResolvedValue(
      issuedCoupon({ expiresAt: PAST }),
    );
    const service = new CouponUserService(prisma as never);

    const result = await service.getCouponStatus('u1', 'co1');

    expect(result.status).toBe('EXPIRED');
  });

  it('returns REDEEMED status with applied and merchantPromotion', async () => {
    const prisma = makePrisma();
    prisma.coupon.findUnique.mockResolvedValue(redeemedCoupon());
    const service = new CouponUserService(prisma as never);

    const result = await service.getCouponStatus('u1', 'co1');

    expect(result.status).toBe('REDEEMED');
    expect(result.redeemedAt).toBe('2026-05-10T12:00:00.000Z');
    expect(result.applied).toEqual({
      orderAmount: 5000,
      discountAmount: 1000,
      gift: null,
    });
    expect(result.merchantPromotion).toEqual([
      { type: 'TEXT', text: 'Follow our WeChat!' },
    ]);
  });

  it('includes giftLabel in applied.gift when set', async () => {
    const prisma = makePrisma();
    prisma.coupon.findUnique.mockResolvedValue(
      redeemedCoupon({
        redemption: {
          orderAmount: 3000,
          actualDiscountAmount: 0,
          giftLabel: 'Free drink',
          redeemedAt: new Date('2026-05-10T12:00:00.000Z'),
          merchantId: 'm1',
          merchant: {
            id: 'm1',
            promotionBlocks: null,
          },
        },
      }),
    );
    const service = new CouponUserService(prisma as never);

    const result = await service.getCouponStatus('u1', 'co1');

    expect(result.applied?.gift).toBe('Free drink');
  });

  it('returns empty merchantPromotion array when merchant blocks are null', async () => {
    const prisma = makePrisma();
    prisma.coupon.findUnique.mockResolvedValue(
      redeemedCoupon({
        redemption: {
          orderAmount: 3000,
          actualDiscountAmount: 0,
          giftLabel: null,
          redeemedAt: new Date('2026-05-10T12:00:00.000Z'),
          merchantId: 'm1',
          merchant: { id: 'm1', promotionBlocks: null },
        },
      }),
    );
    const service = new CouponUserService(prisma as never);

    const result = await service.getCouponStatus('u1', 'co1');

    expect(result.merchantPromotion).toEqual([]);
  });

  it('throws NotFoundException when the coupon does not belong to the caller', async () => {
    const prisma = makePrisma();
    prisma.coupon.findUnique.mockResolvedValue(null);
    const service = new CouponUserService(prisma as never);

    await expect(service.getCouponStatus('u1', 'co1')).rejects.toThrow(
      NotFoundException,
    );
  });
});

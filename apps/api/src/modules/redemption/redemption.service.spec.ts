import { RedemptionService } from './redemption.service';

type MockTx = {
  coupon: { findFirst: jest.Mock; updateMany: jest.Mock; count: jest.Mock };
  redemption: { create: jest.Mock };
  auditLog: { create: jest.Mock };
  merchant: { findUnique: jest.Mock };
};

function makeTxPrisma() {
  const tx: MockTx = {
    coupon: { findFirst: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    redemption: { create: jest.fn().mockResolvedValue({}) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    merchant: {
      findUnique: jest.fn().mockResolvedValue({ promotionBlocks: [] }),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((cb: (t: MockTx) => unknown) => cb(tx)),
  };
  return { prisma, tx };
}

function candidate(rule: unknown) {
  return {
    id: 'co1',
    userId: 'u1',
    template: {
      title: '券',
      benefitType: rule == null ? 'CUSTOM' : 'FULL_REDUCTION',
      faceValue: 3000,
      rule,
    },
    user: { displayName: '小明' },
  };
}

// Social 满减阶梯 (cents): 满30减5 / 满50减12 / 满100减30.
const SOCIAL_RULE = {
  version: 1,
  tiers: [
    { minSpend: 3000, benefit: { type: 'AMOUNT_OFF', amountOff: 500 } },
    { minSpend: 5000, benefit: { type: 'AMOUNT_OFF', amountOff: 1200 } },
    { minSpend: 10000, benefit: { type: 'AMOUNT_OFF', amountOff: 3000 } },
  ],
};

describe('RedemptionService.redeem', () => {
  it('SUCCESS (no rule): flips ISSUED->REDEEMED, writes Redemption + audit, returns coupon + promotion', async () => {
    const { prisma, tx } = makeTxPrisma();
    tx.coupon.findFirst.mockResolvedValue(candidate(null));
    tx.coupon.updateMany.mockResolvedValue({ count: 1 });
    tx.merchant.findUnique.mockResolvedValue({
      promotionBlocks: [{ type: 'TEXT', text: '关注我们' }],
    });
    const service = new RedemptionService(prisma as never);

    const result = await service.redeem(' abcdefghjk ', 'm1', 'mu1');

    expect(tx.coupon.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          code: 'ABCDEFGHJK',
          status: 'ISSUED',
          template: { is: { merchantId: 'm1' } },
          user: { is: { status: 'ACTIVE' } },
        }) as object,
      }),
    );
    expect(tx.redemption.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          couponId: 'co1',
          merchantId: 'm1',
          merchantUserId: 'mu1',
          userId: 'u1',
          faceValueSnapshot: 3000,
          orderAmount: null,
          actualDiscountAmount: null,
        }) as object,
      }),
    );
    expect(result.result).toBe('SUCCESS');
    expect(result.coupon).toEqual({
      title: '券',
      benefitText: '券',
      faceValue: 3000,
      userDisplayName: '小明',
    });
    expect(result.applied).toEqual({
      orderAmount: null,
      discountAmount: 0,
      gift: null,
    });
    expect(result.merchantPromotion).toEqual([
      { type: 'TEXT', text: '关注我们' },
    ]);
  });

  it('SUCCESS (tiered + amount): picks the tier, persists orderAmount + actualDiscountAmount', async () => {
    const { prisma, tx } = makeTxPrisma();
    tx.coupon.findFirst.mockResolvedValue(candidate(SOCIAL_RULE));
    tx.coupon.updateMany.mockResolvedValue({ count: 1 });
    const service = new RedemptionService(prisma as never);

    const result = await service.redeem('ABCDEFGHJK', 'm1', 'mu1', 6000);

    expect(tx.redemption.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderAmount: 6000,
          actualDiscountAmount: 1200, // 满50减12
        }) as object,
      }),
    );
    expect(result.result).toBe('SUCCESS');
    expect(result.coupon?.benefitText).toBe('满30减5 ｜ 满50减12 ｜ 满100减30');
    expect(result.applied).toEqual({
      orderAmount: 6000,
      discountAmount: 1200,
      gift: null,
    });
  });

  it('NEED_AMOUNT: tiered coupon without an amount is not consumed; returns the ladder', async () => {
    const { prisma, tx } = makeTxPrisma();
    tx.coupon.findFirst.mockResolvedValue(candidate(SOCIAL_RULE));
    const service = new RedemptionService(prisma as never);

    const result = await service.redeem('ABCDEFGHJK', 'm1', 'mu1');

    expect(tx.coupon.updateMany).not.toHaveBeenCalled();
    expect(tx.redemption.create).not.toHaveBeenCalled();
    expect(result.result).toBe('NEED_AMOUNT');
    expect(result.coupon?.benefitText).toBe('满30减5 ｜ 满50减12 ｜ 满100减30');
    expect(result.applied).toBeNull();
  });

  it('BELOW_THRESHOLD: an amount under the lowest tier is not consumed', async () => {
    const { prisma, tx } = makeTxPrisma();
    tx.coupon.findFirst.mockResolvedValue(candidate(SOCIAL_RULE));
    const service = new RedemptionService(prisma as never);

    const result = await service.redeem('ABCDEFGHJK', 'm1', 'mu1', 2000);

    expect(tx.coupon.updateMany).not.toHaveBeenCalled();
    expect(tx.redemption.create).not.toHaveBeenCalled();
    expect(result.result).toBe('BELOW_THRESHOLD');
    expect(result.coupon).not.toBeNull();
  });

  it('ALREADY_USED: no redeemable match but a REDEEMED coupon for this merchant + ACTIVE user exists', async () => {
    const { prisma, tx } = makeTxPrisma();
    tx.coupon.findFirst.mockResolvedValue(null);
    tx.coupon.count.mockResolvedValue(1);
    const service = new RedemptionService(prisma as never);

    const result = await service.redeem('ABCDEFGHJK', 'm1', 'mu1');

    // The ALREADY_USED probe must carry the same expiry gate as the redeemable
    // query, so an expired (even if REDEEMED) coupon stays INVALID, not leaked.
    expect(tx.coupon.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'REDEEMED',
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: expect.any(Date) as Date } },
          ],
          template: { is: { merchantId: 'm1' } },
          user: { is: { status: 'ACTIVE' } },
        }) as object,
      }),
    );
    expect(tx.redemption.create).not.toHaveBeenCalled();
    expect(result.result).toBe('ALREADY_USED');
    expect(result.coupon).toBeNull();
    expect(result.applied).toBeNull();
  });

  it('INVALID: no redeemable match and no matching REDEEMED coupon (no existence leak)', async () => {
    const { prisma, tx } = makeTxPrisma();
    tx.coupon.findFirst.mockResolvedValue(null);
    tx.coupon.count.mockResolvedValue(0);
    const service = new RedemptionService(prisma as never);

    const result = await service.redeem('ZZZZZZZZZZ', 'm1', 'mu1');

    expect(result.result).toBe('INVALID');
    expect(result.coupon).toBeNull();
  });

  it('concurrent redeem: candidate read ok but the CAS flip loses the race -> ALREADY_USED', async () => {
    const { prisma, tx } = makeTxPrisma();
    tx.coupon.findFirst.mockResolvedValue(candidate(null));
    tx.coupon.updateMany.mockResolvedValue({ count: 0 }); // someone else flipped it
    const service = new RedemptionService(prisma as never);

    const result = await service.redeem('ABCDEFGHJK', 'm1', 'mu1');

    expect(tx.redemption.create).not.toHaveBeenCalled();
    expect(result.result).toBe('ALREADY_USED');
  });
});

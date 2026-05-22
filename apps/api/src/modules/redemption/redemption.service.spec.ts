import { RedemptionService } from './redemption.service';

type MockTx = {
  coupon: { updateMany: jest.Mock; findUnique: jest.Mock; count: jest.Mock };
  redemption: { create: jest.Mock };
  auditLog: { create: jest.Mock };
  merchant: { findUnique: jest.Mock };
};

function makeTxPrisma() {
  const tx: MockTx = {
    coupon: { updateMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() },
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

describe('RedemptionService.redeem', () => {
  it('SUCCESS: flips ISSUED->REDEEMED, writes Redemption + audit, returns coupon + promotion', async () => {
    const { prisma, tx } = makeTxPrisma();
    tx.coupon.updateMany.mockResolvedValue({ count: 1 });
    tx.coupon.findUnique.mockResolvedValue({
      id: 'co1',
      userId: 'u1',
      template: {
        title: '满50减10',
        benefitType: 'FULL_REDUCTION',
        faceValue: 1000,
        rule: null,
      },
      user: { displayName: '小明' },
    });
    tx.merchant.findUnique.mockResolvedValue({
      promotionBlocks: [{ type: 'TEXT', text: '关注我们' }],
    });
    const service = new RedemptionService(prisma as never);

    const result = await service.redeem(' abcdefghjk ', 'm1', 'mu1');

    expect(tx.coupon.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          code: 'ABCDEFGHJK',
          status: 'ISSUED',
          template: { is: { merchantId: 'm1' } },
          user: { is: { status: 'ACTIVE' } },
        }) as object,
        data: { status: 'REDEEMED' },
      }),
    );
    expect(tx.redemption.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          couponId: 'co1',
          merchantId: 'm1',
          merchantUserId: 'mu1',
          userId: 'u1',
          faceValueSnapshot: 1000,
        }) as object,
      }),
    );
    expect(result.result).toBe('SUCCESS');
    expect(result.coupon).toEqual({
      title: '满50减10',
      benefitText: '满50减10',
      faceValue: 1000,
      userDisplayName: '小明',
    });
    expect(result.merchantPromotion).toEqual([
      { type: 'TEXT', text: '关注我们' },
    ]);
  });

  it('ALREADY_USED: no flip but a REDEEMED coupon for this merchant + ACTIVE user exists', async () => {
    const { prisma, tx } = makeTxPrisma();
    tx.coupon.updateMany.mockResolvedValue({ count: 0 });
    tx.coupon.count.mockResolvedValue(1);
    const service = new RedemptionService(prisma as never);

    const result = await service.redeem('ABCDEFGHJK', 'm1', 'mu1');

    expect(tx.redemption.create).not.toHaveBeenCalled();
    expect(result.result).toBe('ALREADY_USED');
    expect(result.coupon).toBeNull();
    expect(result.merchantPromotion).toBeNull();
  });

  it('INVALID: no flip and no matching REDEEMED coupon (no existence leak)', async () => {
    const { prisma, tx } = makeTxPrisma();
    tx.coupon.updateMany.mockResolvedValue({ count: 0 });
    tx.coupon.count.mockResolvedValue(0);
    const service = new RedemptionService(prisma as never);

    const result = await service.redeem('ZZZZZZZZZZ', 'm1', 'mu1');

    expect(result.result).toBe('INVALID');
    expect(result.coupon).toBeNull();
    expect(result.merchantPromotion).toBeNull();
  });
});

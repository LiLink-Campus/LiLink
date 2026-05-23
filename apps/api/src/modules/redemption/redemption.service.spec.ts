import { RedemptionService } from './redemption.service';
import type { RedeemTicketService } from './redeem-ticket.service';

type MockTx = {
  coupon: { findFirst: jest.Mock; updateMany: jest.Mock; count: jest.Mock };
  redemption: { create: jest.Mock };
  auditLog: { create: jest.Mock };
};

function makeTxPrisma() {
  const tx: MockTx = {
    coupon: { findFirst: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
    redemption: { create: jest.fn().mockResolvedValue({}) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((cb: (t: MockTx) => unknown) => cb(tx)),
  };
  return { prisma, tx };
}

const VALID_TICKET = 'valid-ticket';

// A ticket service that resolves VALID_TICKET to {couponId: 'co1'} for the
// given merchant, and rejects everything else (forged / expired / cross-merchant).
function makeTicketService(merchantId = 'm1'): {
  ticket: RedeemTicketService;
  verify: jest.Mock;
} {
  const verify = jest.fn((token: string, mId: string) =>
    token === VALID_TICKET && mId === merchantId
      ? { couponId: 'co1', merchantId }
      : null,
  );
  const ticket = { verify, sign: jest.fn() } as unknown as RedeemTicketService;
  return { ticket, verify };
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

// A no-threshold gift coupon: redeeming hands over a gift, no amount needed.
const GIFT_RULE = {
  version: 1,
  tiers: [{ minSpend: 0, benefit: { type: 'GIFT', description: '赠杯垫' } }],
};

describe('RedemptionService.redeem', () => {
  it('INVALID: ticket fails verification (forged / expired / cross-merchant) — no DB touch', async () => {
    const { prisma, tx } = makeTxPrisma();
    const { ticket, verify } = makeTicketService();
    const service = new RedemptionService(prisma as never, ticket);

    const result = await service.redeem('bogus-ticket', 'm1', 'mu1');

    expect(verify).toHaveBeenCalledWith('bogus-ticket', 'm1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.coupon.findFirst).not.toHaveBeenCalled();
    expect(result.result).toBe('INVALID');
    expect(result.coupon).toBeNull();
    expect(result.applied).toBeNull();
  });

  it('SUCCESS (no rule): looks up coupon by ticket id, flips ISSUED->REDEEMED, writes Redemption + audit', async () => {
    const { prisma, tx } = makeTxPrisma();
    tx.coupon.findFirst.mockResolvedValue(candidate(null));
    tx.coupon.updateMany.mockResolvedValue({ count: 1 });
    const { ticket } = makeTicketService();
    const service = new RedemptionService(prisma as never, ticket);

    const result = await service.redeem(VALID_TICKET, 'm1', 'mu1');

    // Coupon is reloaded by the id from the ticket, re-asserting the gate.
    expect(tx.coupon.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'co1',
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
          giftLabel: null,
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
  });

  it('SUCCESS: response carries no merchantPromotion field', async () => {
    const { prisma, tx } = makeTxPrisma();
    tx.coupon.findFirst.mockResolvedValue(candidate(null));
    tx.coupon.updateMany.mockResolvedValue({ count: 1 });
    const { ticket } = makeTicketService();
    const service = new RedemptionService(prisma as never, ticket);

    const result = await service.redeem(VALID_TICKET, 'm1', 'mu1');

    expect(result).not.toHaveProperty('merchantPromotion');
  });

  it('SUCCESS (gift coupon): persists the gift label on the Redemption', async () => {
    const { prisma, tx } = makeTxPrisma();
    tx.coupon.findFirst.mockResolvedValue(candidate(GIFT_RULE));
    tx.coupon.updateMany.mockResolvedValue({ count: 1 });
    const { ticket } = makeTicketService();
    const service = new RedemptionService(prisma as never, ticket);

    const result = await service.redeem(VALID_TICKET, 'm1', 'mu1');

    expect(tx.redemption.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          giftLabel: '赠杯垫',
          actualDiscountAmount: null,
        }) as object,
      }),
    );
    expect(result.applied).toEqual({
      orderAmount: null,
      discountAmount: 0,
      gift: '赠杯垫',
    });
  });

  it('SUCCESS (tiered + amount): picks the tier, persists orderAmount + actualDiscountAmount', async () => {
    const { prisma, tx } = makeTxPrisma();
    tx.coupon.findFirst.mockResolvedValue(candidate(SOCIAL_RULE));
    tx.coupon.updateMany.mockResolvedValue({ count: 1 });
    const { ticket } = makeTicketService();
    const service = new RedemptionService(prisma as never, ticket);

    const result = await service.redeem(VALID_TICKET, 'm1', 'mu1', 6000);

    expect(tx.redemption.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderAmount: 6000,
          actualDiscountAmount: 1200, // 满50减12
          giftLabel: null,
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
    const { ticket } = makeTicketService();
    const service = new RedemptionService(prisma as never, ticket);

    const result = await service.redeem(VALID_TICKET, 'm1', 'mu1');

    expect(tx.coupon.updateMany).not.toHaveBeenCalled();
    expect(tx.redemption.create).not.toHaveBeenCalled();
    expect(result.result).toBe('NEED_AMOUNT');
    expect(result.coupon?.benefitText).toBe('满30减5 ｜ 满50减12 ｜ 满100减30');
    expect(result.applied).toBeNull();
  });

  it('BELOW_THRESHOLD: an amount under the lowest tier is not consumed', async () => {
    const { prisma, tx } = makeTxPrisma();
    tx.coupon.findFirst.mockResolvedValue(candidate(SOCIAL_RULE));
    const { ticket } = makeTicketService();
    const service = new RedemptionService(prisma as never, ticket);

    const result = await service.redeem(VALID_TICKET, 'm1', 'mu1', 2000);

    expect(tx.coupon.updateMany).not.toHaveBeenCalled();
    expect(tx.redemption.create).not.toHaveBeenCalled();
    expect(result.result).toBe('BELOW_THRESHOLD');
    expect(result.coupon).not.toBeNull();
  });

  it('ALREADY_USED: ticket replay — coupon already REDEEMED for this merchant + ACTIVE user', async () => {
    const { prisma, tx } = makeTxPrisma();
    // The redeemable (ISSUED) reload misses; the REDEEMED probe hits.
    tx.coupon.findFirst.mockResolvedValue(null);
    tx.coupon.count.mockResolvedValue(1);
    const { ticket } = makeTicketService();
    const service = new RedemptionService(prisma as never, ticket);

    const result = await service.redeem(VALID_TICKET, 'm1', 'mu1');

    // The probe scopes to the same coupon id + merchant + ACTIVE holder + expiry.
    expect(tx.coupon.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'co1',
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

  it('INVALID: ticket valid but coupon no longer passes the gate and was never redeemed', async () => {
    const { prisma, tx } = makeTxPrisma();
    tx.coupon.findFirst.mockResolvedValue(null);
    tx.coupon.count.mockResolvedValue(0);
    const { ticket } = makeTicketService();
    const service = new RedemptionService(prisma as never, ticket);

    const result = await service.redeem(VALID_TICKET, 'm1', 'mu1');

    expect(result.result).toBe('INVALID');
    expect(result.coupon).toBeNull();
  });

  it('concurrent redeem: reload ok but the CAS flip loses the race -> ALREADY_USED', async () => {
    const { prisma, tx } = makeTxPrisma();
    tx.coupon.findFirst.mockResolvedValue(candidate(null));
    tx.coupon.updateMany.mockResolvedValue({ count: 0 }); // someone else flipped it
    const { ticket } = makeTicketService();
    const service = new RedemptionService(prisma as never, ticket);

    const result = await service.redeem(VALID_TICKET, 'm1', 'mu1');

    expect(tx.redemption.create).not.toHaveBeenCalled();
    expect(result.result).toBe('ALREADY_USED');
  });
});

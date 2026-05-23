import { RedemptionService } from './redemption.service';
import type { RedeemTicketService } from './redeem-ticket.service';
import { generateTotpSecret, generateTotpToken } from '@lilink/shared';

type MockPrisma = {
  coupon: { findFirst: jest.Mock };
};

function makePrisma() {
  const prisma: MockPrisma = {
    coupon: { findFirst: jest.fn() },
  };
  return prisma;
}

function makeTicketService(token = 'signed-ticket'): {
  ticket: RedeemTicketService;
  sign: jest.Mock;
} {
  const sign = jest.fn().mockReturnValue(token);
  const ticket = { sign, verify: jest.fn() } as unknown as RedeemTicketService;
  return { ticket, sign };
}

// Social 满减阶梯 (cents): 满30减5 / 满50减12 / 满100减30 (amount-dependent).
const SOCIAL_RULE = {
  version: 1,
  tiers: [
    { minSpend: 3000, benefit: { type: 'AMOUNT_OFF', amountOff: 500 } },
    { minSpend: 5000, benefit: { type: 'AMOUNT_OFF', amountOff: 1200 } },
    { minSpend: 10000, benefit: { type: 'AMOUNT_OFF', amountOff: 3000 } },
  ],
};

function couponRow(opts: {
  status?: 'ISSUED' | 'REDEEMED';
  totpSecret: string | null;
  rule?: unknown;
}) {
  return {
    id: 'co1',
    userId: 'u1',
    status: opts.status ?? 'ISSUED',
    expiresAt: null,
    totpSecret: opts.totpSecret,
    template: {
      title: '券',
      benefitType: opts.rule == null ? 'CUSTOM' : 'FULL_REDUCTION',
      faceValue: 3000,
      rule: opts.rule ?? null,
    },
    user: { status: 'ACTIVE', displayName: '小明' },
  };
}

describe('RedemptionService.prepare', () => {
  it('OK: valid ISSUED coupon for this merchant + fresh totp -> ticket + coupon + needAmount', async () => {
    const prisma = makePrisma();
    const secret = generateTotpSecret();
    prisma.coupon.findFirst.mockResolvedValue(
      couponRow({ totpSecret: secret, rule: SOCIAL_RULE }),
    );
    const { ticket, sign } = makeTicketService('TICKET-XYZ');
    const service = new RedemptionService(prisma as never, ticket);

    const result = await service.prepare({
      merchantId: 'm1',
      code: ' abcdefghjk ',
      totp: generateTotpToken(secret),
    });

    // Lookup is normalized (trim + uppercase) and scoped to this merchant.
    expect(prisma.coupon.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          code: 'ABCDEFGHJK',
          template: { is: { merchantId: 'm1' } },
          user: { is: { status: 'ACTIVE' } },
        }) as object,
      }),
    );
    expect(result.result).toBe('OK');
    expect(result.coupon).toEqual({
      title: '券',
      benefitText: '满30减5 ｜ 满50减12 ｜ 满100减30',
      faceValue: 3000,
      userDisplayName: '小明',
    });
    expect(result.needAmount).toBe(true);
    expect(result.redeemTicket).toBe('TICKET-XYZ');
    expect(sign).toHaveBeenCalledWith({ couponId: 'co1', merchantId: 'm1' });
  });

  it('OK: no-rule coupon -> needAmount false', async () => {
    const prisma = makePrisma();
    const secret = generateTotpSecret();
    prisma.coupon.findFirst.mockResolvedValue(
      couponRow({ totpSecret: secret, rule: null }),
    );
    const { ticket } = makeTicketService();
    const service = new RedemptionService(prisma as never, ticket);

    const result = await service.prepare({
      merchantId: 'm1',
      code: 'ABCDEFGHJK',
      totp: generateTotpToken(secret),
    });

    expect(result.result).toBe('OK');
    expect(result.needAmount).toBe(false);
  });

  it('EXPIRED_CODE: stale/wrong totp does not issue a ticket and does not mutate state', async () => {
    const prisma = makePrisma();
    const secret = generateTotpSecret();
    prisma.coupon.findFirst.mockResolvedValue(
      couponRow({ totpSecret: secret }),
    );
    const { ticket, sign } = makeTicketService();
    const service = new RedemptionService(prisma as never, ticket);

    const result = await service.prepare({
      merchantId: 'm1',
      code: 'ABCDEFGHJK',
      totp: '000000', // not the current token
    });

    expect(result.result).toBe('EXPIRED_CODE');
    expect(result.redeemTicket).toBeUndefined();
    expect(result.coupon).toBeUndefined();
    expect(sign).not.toHaveBeenCalled();
  });

  it('EXPIRED_CODE: coupon with null totpSecret', async () => {
    const prisma = makePrisma();
    prisma.coupon.findFirst.mockResolvedValue(couponRow({ totpSecret: null }));
    const { ticket, sign } = makeTicketService();
    const service = new RedemptionService(prisma as never, ticket);

    const result = await service.prepare({
      merchantId: 'm1',
      code: 'ABCDEFGHJK',
      totp: '123456',
    });

    expect(result.result).toBe('EXPIRED_CODE');
    expect(sign).not.toHaveBeenCalled();
  });

  it('ALREADY_USED: a REDEEMED coupon is reported before any totp check', async () => {
    const prisma = makePrisma();
    const secret = generateTotpSecret();
    prisma.coupon.findFirst.mockResolvedValue(
      couponRow({ status: 'REDEEMED', totpSecret: secret }),
    );
    const { ticket, sign } = makeTicketService();
    const service = new RedemptionService(prisma as never, ticket);

    const result = await service.prepare({
      merchantId: 'm1',
      code: 'ABCDEFGHJK',
      totp: generateTotpToken(secret),
    });

    expect(result.result).toBe('ALREADY_USED');
    expect(result.redeemTicket).toBeUndefined();
    expect(sign).not.toHaveBeenCalled();
  });

  it('INVALID: no coupon row (wrong code / different merchant / inactive holder / expired)', async () => {
    const prisma = makePrisma();
    prisma.coupon.findFirst.mockResolvedValue(null);
    const { ticket, sign } = makeTicketService();
    const service = new RedemptionService(prisma as never, ticket);

    const result = await service.prepare({
      merchantId: 'm1',
      code: 'ZZZZZZZZZZ',
      totp: '123456',
    });

    expect(result.result).toBe('INVALID');
    expect(result.coupon).toBeUndefined();
    expect(sign).not.toHaveBeenCalled();
  });

  it('prepare never mutates coupon status (read-only: no $transaction, no updateMany)', async () => {
    const prisma = makePrisma() as MockPrisma & {
      $transaction?: unknown;
      coupon: { updateMany?: unknown };
    };
    const secret = generateTotpSecret();
    prisma.coupon.findFirst.mockResolvedValue(
      couponRow({ totpSecret: secret }),
    );
    const { ticket } = makeTicketService();
    const service = new RedemptionService(prisma as never, ticket);

    await service.prepare({
      merchantId: 'm1',
      code: 'ABCDEFGHJK',
      totp: generateTotpToken(secret),
    });

    // No write surface was even referenced.
    expect(prisma.$transaction).toBeUndefined();
    expect(prisma.coupon.updateMany).toBeUndefined();
  });
});

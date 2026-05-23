import { ActivationService } from './activation.service';

type MockTx = {
  campaign: { findUnique: jest.Mock };
  campaignActivation: { upsert: jest.Mock; update: jest.Mock };
  couponTemplate: { findMany: jest.Mock };
  coupon: { findMany: jest.Mock; create: jest.Mock };
  auditLog: { create: jest.Mock };
};

function makeTxPrisma() {
  const tx: MockTx = {
    campaign: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
    campaignActivation: {
      upsert: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    couponTemplate: { findMany: jest.fn().mockResolvedValue([]) },
    coupon: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    ...tx,
    $transaction: jest.fn((cb: (t: MockTx) => unknown) => cb(tx)),
  };
  return { prisma, tx };
}

const activatedUser = {
  firstOptedInAt: new Date('2026-05-01T00:00:00.000Z'),
  referralCampaignId: 'camp1',
  questionnaireResponse: { submittedAt: new Date('2026-05-01T00:00:00.000Z') },
};

function p2002(target: string[]) {
  return Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
    meta: { target },
  });
}

describe('ActivationService.tryGrantCoupons', () => {
  it('does nothing when the user has never opted in', async () => {
    const { prisma } = makeTxPrisma();
    prisma.user.findUnique.mockResolvedValue({
      ...activatedUser,
      firstOptedInAt: null,
    });
    const service = new ActivationService(prisma as never);
    await service.tryGrantCoupons('u1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does nothing when the questionnaire is not submitted', async () => {
    const { prisma } = makeTxPrisma();
    prisma.user.findUnique.mockResolvedValue({
      ...activatedUser,
      questionnaireResponse: { submittedAt: null },
    });
    const service = new ActivationService(prisma as never);
    await service.tryGrantCoupons('u1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does nothing when there is no campaign attribution', async () => {
    const { prisma } = makeTxPrisma();
    prisma.user.findUnique.mockResolvedValue({
      ...activatedUser,
      referralCampaignId: null,
    });
    const service = new ActivationService(prisma as never);
    await service.tryGrantCoupons('u1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not grant when the frozen campaign is not ACTIVE (re-checked in tx)', async () => {
    const { prisma, tx } = makeTxPrisma();
    prisma.user.findUnique.mockResolvedValue(activatedUser);
    tx.campaign.findUnique.mockResolvedValue({ status: 'ENDED' });
    const service = new ActivationService(prisma as never);

    await service.tryGrantCoupons('u1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.campaignActivation.upsert).not.toHaveBeenCalled();
    expect(tx.coupon.create).not.toHaveBeenCalled();
  });

  it('grants one coupon per active template, marks granted, and audits', async () => {
    const { prisma, tx } = makeTxPrisma();
    prisma.user.findUnique.mockResolvedValue(activatedUser);
    tx.campaignActivation.upsert.mockResolvedValue({
      id: 'act1',
      couponsGrantedAt: null,
    });
    tx.couponTemplate.findMany.mockResolvedValue([
      { id: 't1', validDays: 30, validUntil: null },
      { id: 't2', validDays: null, validUntil: new Date('2026-12-31') },
    ]);
    tx.coupon.findMany.mockResolvedValue([]);
    let n = 0;
    tx.coupon.create.mockImplementation(() =>
      Promise.resolve({ id: `co${(n += 1)}` }),
    );
    const service = new ActivationService(prisma as never);

    await service.tryGrantCoupons('u1');

    expect(tx.coupon.create).toHaveBeenCalledTimes(2);
    expect(tx.campaignActivation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'act1' },
        data: expect.objectContaining({
          couponsGrantedAt: expect.any(Date) as Date,
        }) as object,
      }),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'coupon.granted',
          metadata: expect.objectContaining({
            userId: 'u1',
            campaignId: 'camp1',
            couponIds: ['co1', 'co2'],
          }) as object,
        }) as object,
      }),
    );
  });

  it('is idempotent: skips granting when couponsGrantedAt is already set', async () => {
    const { prisma, tx } = makeTxPrisma();
    prisma.user.findUnique.mockResolvedValue(activatedUser);
    tx.campaignActivation.upsert.mockResolvedValue({
      id: 'act1',
      couponsGrantedAt: new Date('2026-05-02T00:00:00.000Z'),
    });
    const service = new ActivationService(prisma as never);

    await service.tryGrantCoupons('u1');

    expect(tx.couponTemplate.findMany).not.toHaveBeenCalled();
    expect(tx.coupon.create).not.toHaveBeenCalled();
  });

  it('skips templates the user already holds', async () => {
    const { prisma, tx } = makeTxPrisma();
    prisma.user.findUnique.mockResolvedValue(activatedUser);
    tx.campaignActivation.upsert.mockResolvedValue({
      id: 'act1',
      couponsGrantedAt: null,
    });
    tx.couponTemplate.findMany.mockResolvedValue([
      { id: 't1', validDays: null, validUntil: null },
      { id: 't2', validDays: null, validUntil: null },
    ]);
    tx.coupon.findMany.mockResolvedValue([{ templateId: 't1' }]);
    tx.coupon.create.mockResolvedValue({ id: 'co1' });
    const service = new ActivationService(prisma as never);

    await service.tryGrantCoupons('u1');

    expect(tx.coupon.create).toHaveBeenCalledTimes(1);
  });

  it('retries on a coupon-code collision (P2002 on code)', async () => {
    const { prisma, tx } = makeTxPrisma();
    prisma.user.findUnique.mockResolvedValue(activatedUser);
    tx.campaignActivation.upsert.mockResolvedValue({
      id: 'act1',
      couponsGrantedAt: null,
    });
    tx.couponTemplate.findMany.mockResolvedValue([
      { id: 't1', validDays: null, validUntil: null },
    ]);
    tx.coupon.findMany.mockResolvedValue([]);
    let calls = 0;
    tx.coupon.create.mockImplementation(() => {
      calls += 1;
      if (calls === 1) return Promise.reject(p2002(['code']));
      return Promise.resolve({ id: 'co1' });
    });
    const service = new ActivationService(prisma as never);

    await service.tryGrantCoupons('u1');

    expect(calls).toBe(2);
  });

  it('skips a template on a (userId,templateId) collision without retrying', async () => {
    const { prisma, tx } = makeTxPrisma();
    prisma.user.findUnique.mockResolvedValue(activatedUser);
    tx.campaignActivation.upsert.mockResolvedValue({
      id: 'act1',
      couponsGrantedAt: null,
    });
    tx.couponTemplate.findMany.mockResolvedValue([
      { id: 't1', validDays: null, validUntil: null },
    ]);
    tx.coupon.findMany.mockResolvedValue([]);
    tx.coupon.create.mockRejectedValue(p2002(['userId', 'templateId']));
    const service = new ActivationService(prisma as never);

    await service.tryGrantCoupons('u1');

    expect(tx.coupon.create).toHaveBeenCalledTimes(1);
    expect(tx.campaignActivation.update).toHaveBeenCalled();
  });

  it('never throws into the caller (swallows errors)', async () => {
    const { prisma } = makeTxPrisma();
    prisma.user.findUnique.mockRejectedValue(new Error('db down'));
    const service = new ActivationService(prisma as never);
    await expect(service.tryGrantCoupons('u1')).resolves.toBeUndefined();
  });

  it('newly issued coupon has a non-null totpSecret and a code of length 6', async () => {
    const { prisma, tx } = makeTxPrisma();
    prisma.user.findUnique.mockResolvedValue(activatedUser);
    tx.campaignActivation.upsert.mockResolvedValue({
      id: 'act1',
      couponsGrantedAt: null,
    });
    tx.couponTemplate.findMany.mockResolvedValue([
      { id: 't1', validDays: null, validUntil: null },
    ]);
    tx.coupon.findMany.mockResolvedValue([]);
    tx.coupon.create.mockResolvedValue({ id: 'co1' });
    const service = new ActivationService(prisma as never);

    await service.tryGrantCoupons('u1');

    expect(tx.coupon.create).toHaveBeenCalledTimes(1);
    const callArg = tx.coupon.create.mock.calls[0][0] as {
      data: { code: string; totpSecret: unknown };
    };
    expect(callArg.data.totpSecret).toBeTruthy();
    expect(typeof callArg.data.totpSecret).toBe('string');
    expect(callArg.data.code).toHaveLength(6);
  });
});

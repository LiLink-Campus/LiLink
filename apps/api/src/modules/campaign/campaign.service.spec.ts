import { CampaignService } from './campaign.service';

type MockTx = {
  campaign: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
  couponTemplate: {
    create: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
  };
  merchant: { findUnique: jest.Mock };
  auditLog: { create: jest.Mock };
};

function makeTxPrisma() {
  const tx: MockTx = {
    campaign: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    couponTemplate: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    merchant: { findUnique: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((cb: (t: MockTx) => unknown) => cb(tx)),
  };
  return { prisma, tx };
}

function campaignRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    name: '春季活动',
    slug: 'spring',
    status: 'DRAFT',
    isDefault: false,
    startsAt: null,
    endsAt: null,
    description: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    ...overrides,
  };
}

function templateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    campaignId: 'c1',
    merchantId: 'm1',
    title: '满50减10',
    description: null,
    benefitType: 'FULL_REDUCTION',
    faceValue: 1000,
    validDays: 30,
    validUntil: null,
    rule: null,
    isActive: true,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    merchant: { id: 'm1', name: 'Cafe', isActive: true },
    _count: { coupons: 0 },
    ...overrides,
  };
}

describe('CampaignService', () => {
  beforeEach(() => jest.resetAllMocks());

  describe('createCampaign', () => {
    it('creates a DRAFT campaign with a normalized slug + audit', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.campaign.create.mockImplementation(
        ({ data }: { data: { name: string; slug: string } }) =>
          Promise.resolve(campaignRow({ name: data.name, slug: data.slug })),
      );
      const service = new CampaignService(prisma as never);

      const result = await service.createCampaign(
        { name: '  春季活动 ', slug: ' Spring-2026 ' },
        'admin-1',
      );

      expect(tx.campaign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: '春季活动',
            slug: 'spring-2026',
          }) as object,
        }),
      );
      expect(result.slug).toBe('spring-2026');
      expect(tx.auditLog.create).toHaveBeenCalled();
    });

    it('rejects an invalid slug', async () => {
      const { prisma } = makeTxPrisma();
      const service = new CampaignService(prisma as never);
      await expect(
        service.createCampaign({ name: 'x', slug: 'has space' }, 'admin-1'),
      ).rejects.toThrow(/Slug/);
    });

    it('maps a slug unique collision (P2002) to a friendly error', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.campaign.create.mockRejectedValue(
        Object.assign(new Error('dup'), { code: 'P2002' }),
      );
      const service = new CampaignService(prisma as never);
      await expect(
        service.createCampaign({ name: 'x', slug: 'spring' }, 'admin-1'),
      ).rejects.toThrow('Campaign slug already exists.');
    });

    it('rejects startsAt >= endsAt', async () => {
      const { prisma } = makeTxPrisma();
      const service = new CampaignService(prisma as never);
      await expect(
        service.createCampaign(
          {
            name: 'x',
            slug: 'spring',
            startsAt: '2026-06-02T00:00:00.000Z',
            endsAt: '2026-06-01T00:00:00.000Z',
          },
          'admin-1',
        ),
      ).rejects.toThrow(/before/);
    });
  });

  describe('updateCampaign', () => {
    it('rejects when no fields are supplied', async () => {
      const { prisma } = makeTxPrisma();
      const service = new CampaignService(prisma as never);
      await expect(service.updateCampaign('c1', {}, 'admin-1')).rejects.toThrow(
        'No updatable fields supplied.',
      );
    });

    it('throws NotFound when the campaign is missing', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.campaign.findUnique.mockResolvedValue(null);
      const service = new CampaignService(prisma as never);
      await expect(
        service.updateCampaign('cX', { status: 'ACTIVE' }, 'admin-1'),
      ).rejects.toThrow('Campaign not found.');
    });

    it('promoting to ACTIVE default demotes other active defaults in the same transaction', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.campaign.findUnique.mockResolvedValue(
        campaignRow({ status: 'DRAFT', isDefault: false }),
      );
      tx.campaign.update.mockResolvedValue(
        campaignRow({ status: 'ACTIVE', isDefault: true }),
      );
      const service = new CampaignService(prisma as never);

      const result = await service.updateCampaign(
        'c1',
        { status: 'ACTIVE', isDefault: true },
        'admin-1',
      );

      expect(tx.campaign.updateMany).toHaveBeenCalledWith({
        where: { status: 'ACTIVE', isDefault: true, id: { not: 'c1' } },
        data: { isDefault: false },
      });
      expect(tx.campaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c1' },
          data: expect.objectContaining({
            status: 'ACTIVE',
            isDefault: true,
          }) as object,
        }),
      );
      expect(result.isDefault).toBe(true);
    });

    it('forces isDefault off when the status becomes ENDED', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.campaign.findUnique.mockResolvedValue(
        campaignRow({ status: 'ACTIVE', isDefault: true }),
      );
      tx.campaign.update.mockResolvedValue(
        campaignRow({ status: 'ENDED', isDefault: false }),
      );
      const service = new CampaignService(prisma as never);

      await service.updateCampaign('c1', { status: 'ENDED' }, 'admin-1');

      expect(tx.campaign.updateMany).not.toHaveBeenCalled();
      expect(tx.campaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ENDED',
            isDefault: false,
          }) as object,
        }),
      );
    });
  });

  describe('createTemplate', () => {
    it('rejects when the merchant is not found', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.campaign.findUnique.mockResolvedValue({ id: 'c1' });
      tx.merchant.findUnique.mockResolvedValue(null);
      const service = new CampaignService(prisma as never);
      await expect(
        service.createTemplate(
          'c1',
          {
            merchantId: 'mX',
            title: 't',
            benefitType: 'CUSTOM',
            faceValue: 1000,
          },
          'admin-1',
        ),
      ).rejects.toThrow('Merchant not found.');
    });

    it('rejects an inactive merchant', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.campaign.findUnique.mockResolvedValue({ id: 'c1' });
      tx.merchant.findUnique.mockResolvedValue({ id: 'm1', isActive: false });
      const service = new CampaignService(prisma as never);
      await expect(
        service.createTemplate(
          'c1',
          { merchantId: 'm1', title: 't', benefitType: 'CUSTOM', faceValue: 0 },
          'admin-1',
        ),
      ).rejects.toThrow('Merchant is inactive.');
    });

    it('rejects validDays + validUntil supplied together', async () => {
      const { prisma } = makeTxPrisma();
      const service = new CampaignService(prisma as never);
      await expect(
        service.createTemplate(
          'c1',
          {
            merchantId: 'm1',
            title: 't',
            benefitType: 'DISCOUNT',
            faceValue: 500,
            validDays: 30,
            validUntil: '2026-12-31T00:00:00.000Z',
          },
          'admin-1',
        ),
      ).rejects.toThrow(/at most one/);
    });

    it('creates a template (validDays branch) with merchant snapshot + audit', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.campaign.findUnique.mockResolvedValue({ id: 'c1' });
      tx.merchant.findUnique.mockResolvedValue({ id: 'm1', isActive: true });
      tx.couponTemplate.create.mockResolvedValue(templateRow());
      const service = new CampaignService(prisma as never);

      const result = await service.createTemplate(
        'c1',
        {
          merchantId: 'm1',
          title: ' 满50减10 ',
          benefitType: 'FULL_REDUCTION',
          faceValue: 1000,
          validDays: 30,
          rule: {
            version: 1,
            tiers: [
              {
                minSpend: 5000,
                benefit: { type: 'AMOUNT_OFF', amountOff: 1000 },
              },
            ],
          },
        },
        'admin-1',
      );

      expect(tx.couponTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            campaignId: 'c1',
            merchantId: 'm1',
            title: '满50减10',
            faceValue: 1000,
            validDays: 30,
            validUntil: null,
            rule: {
              version: 1,
              tiers: [
                {
                  minSpend: 5000,
                  benefit: { type: 'AMOUNT_OFF', amountOff: 1000 },
                },
              ],
            },
          }) as object,
        }),
      );
      expect(result.couponCount).toBe(0);
      expect(result.merchant).toEqual({
        id: 'm1',
        name: 'Cafe',
        isActive: true,
      });
      expect(tx.auditLog.create).toHaveBeenCalled();
    });

    it('stores a validated tiered rule (Social 满减阶梯)', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.campaign.findUnique.mockResolvedValue({ id: 'c1' });
      tx.merchant.findUnique.mockResolvedValue({ id: 'm1', isActive: true });
      tx.couponTemplate.create.mockResolvedValue(templateRow());
      const service = new CampaignService(prisma as never);

      const rule = {
        version: 1,
        tiers: [
          { minSpend: 3000, benefit: { type: 'AMOUNT_OFF', amountOff: 500 } },
          { minSpend: 5000, benefit: { type: 'AMOUNT_OFF', amountOff: 1200 } },
          { minSpend: 10000, benefit: { type: 'AMOUNT_OFF', amountOff: 3000 } },
        ],
      };
      await service.createTemplate(
        'c1',
        {
          merchantId: 'm1',
          title: 'Social',
          benefitType: 'FULL_REDUCTION',
          faceValue: 3000,
          rule,
        },
        'admin-1',
      );

      expect(tx.couponTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ rule }) as object,
        }),
      );
    });

    it('rejects a typed coupon with no rule', async () => {
      const { prisma } = makeTxPrisma();
      const service = new CampaignService(prisma as never);
      await expect(
        service.createTemplate(
          'c1',
          {
            merchantId: 'm1',
            title: 't',
            benefitType: 'FULL_REDUCTION',
            faceValue: 1000,
          },
          'admin-1',
        ),
      ).rejects.toThrow(/rule/);
    });

    it('rejects a benefit kind that mismatches benefitType', async () => {
      const { prisma } = makeTxPrisma();
      const service = new CampaignService(prisma as never);
      await expect(
        service.createTemplate(
          'c1',
          {
            merchantId: 'm1',
            title: 't',
            benefitType: 'GIFT',
            faceValue: 0,
            rule: {
              version: 1,
              tiers: [
                {
                  minSpend: 5000,
                  benefit: { type: 'AMOUNT_OFF', amountOff: 500 },
                },
              ],
            },
          },
          'admin-1',
        ),
      ).rejects.toThrow(/benefit type must be GIFT/);
    });
  });

  describe('updateTemplate', () => {
    it('revalidates the rule against the current benefitType when the rule changes', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.couponTemplate.findUnique.mockResolvedValue({
        benefitType: 'FULL_REDUCTION',
        rule: null,
      });
      const service = new CampaignService(prisma as never);
      await expect(
        service.updateTemplate(
          't1',
          {
            rule: {
              version: 1,
              tiers: [
                { minSpend: 5000, benefit: { type: 'GIFT', description: 'x' } },
              ],
            },
          },
          'admin-1',
        ),
      ).rejects.toThrow(/benefit type must be AMOUNT_OFF/);
    });

    it('maps a template P2025 to NotFound', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.couponTemplate.update.mockRejectedValue(
        Object.assign(new Error('nf'), { code: 'P2025' }),
      );
      const service = new CampaignService(prisma as never);
      await expect(
        service.updateTemplate('tX', { isActive: false }, 'admin-1'),
      ).rejects.toThrow('Coupon template not found.');
    });

    it('clears validUntil when switching to validDays (cross-PATCH mutual exclusion)', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.couponTemplate.update.mockResolvedValue(
        templateRow({ validDays: 60, validUntil: null }),
      );
      const service = new CampaignService(prisma as never);

      await service.updateTemplate('t1', { validDays: 60 }, 'admin-1');

      expect(tx.couponTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            validDays: 60,
            validUntil: null,
          }) as object,
        }),
      );
    });

    it('clears validDays when switching to validUntil', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.couponTemplate.update.mockResolvedValue(
        templateRow({ validDays: null, validUntil: new Date('2026-12-31') }),
      );
      const service = new CampaignService(prisma as never);

      await service.updateTemplate(
        't1',
        { validUntil: '2026-12-31T00:00:00.000Z' },
        'admin-1',
      );

      expect(tx.couponTemplate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            validDays: null,
            validUntil: expect.any(Date) as Date,
          }) as object,
        }),
      );
    });
  });

  describe('list', () => {
    it('lists campaigns with template/activation counts', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.campaign.findMany.mockResolvedValue([
        { ...campaignRow(), _count: { couponTemplates: 2, activations: 5 } },
      ]);
      tx.campaign.count.mockResolvedValue(1);
      const service = new CampaignService(prisma as never);

      const result = await service.listCampaigns({ status: 'ACTIVE' });

      expect(tx.campaign.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'ACTIVE' } }),
      );
      expect(result.items[0].templateCount).toBe(2);
      expect(result.items[0].activationCount).toBe(5);
    });

    it('lists templates of a campaign', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.campaign.findUnique.mockResolvedValue({ id: 'c1' });
      tx.couponTemplate.findMany.mockResolvedValue([templateRow()]);
      const service = new CampaignService(prisma as never);

      const result = await service.listTemplates('c1');

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('t1');
    });

    it('throws NotFound listing templates of a missing campaign', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.campaign.findUnique.mockResolvedValue(null);
      const service = new CampaignService(prisma as never);
      await expect(service.listTemplates('cX')).rejects.toThrow(
        'Campaign not found.',
      );
    });
  });
});

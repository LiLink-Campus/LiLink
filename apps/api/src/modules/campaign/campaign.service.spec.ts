import { CampaignService } from './campaign.service';

type MockTx = {
  $executeRaw: jest.Mock;
  campaign: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    findFirst: jest.Mock;
  };
  couponTemplate: {
    count: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
  };
  merchant: { findUnique: jest.Mock };
  auditLog: { create: jest.Mock };
};

function makeTxPrisma() {
  const tx: MockTx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    campaign: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    couponTemplate: {
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn(),
      findUnique: jest
        .fn()
        .mockResolvedValue({ campaign: { status: 'DRAFT' } }),
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

    it('publishes globally without a default-activity setting', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.campaign.findUnique.mockResolvedValue(
        campaignRow({ status: 'DRAFT', isDefault: false }),
      );
      tx.campaign.update.mockResolvedValue(
        campaignRow({ status: 'ACTIVE', isDefault: false }),
      );
      const service = new CampaignService(prisma as never);

      const result = await service.updateCampaign(
        'c1',
        { status: 'ACTIVE', isDefault: true },
        'admin-1',
      );

      expect(tx.campaign.updateMany).not.toHaveBeenCalled();
      expect(tx.campaign.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'c1' },
          data: expect.objectContaining({
            status: 'ACTIVE',
            isDefault: false,
          }) as object,
        }),
      );
      expect(result.isDefault).toBe(false);
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
  });
});

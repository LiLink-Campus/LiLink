import { MerchantService } from './merchant.service';

type MockTx = {
  merchant: {
    create: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
  auditLog: { create: jest.Mock };
};

function makeTxPrisma() {
  const tx: MockTx = {
    merchant: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((cb: (t: MockTx) => unknown) => cb(tx)),
  };
  return { prisma, tx };
}

function merchantRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    name: 'Cafe',
    contactInfo: null,
    promotionBlocks: null,
    isActive: true,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('MerchantService', () => {
  beforeEach(() => jest.resetAllMocks());

  describe('createMerchant', () => {
    it('creates with trimmed name + null contact and writes audit in the same transaction', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.merchant.create.mockImplementation(
        ({ data }: { data: { name: string; contactInfo: string | null } }) =>
          Promise.resolve(
            merchantRow({ name: data.name, contactInfo: data.contactInfo }),
          ),
      );
      const service = new MerchantService(prisma as never);

      const result = await service.createMerchant(
        { name: '  Cafe  ' },
        'admin-1',
      );

      expect(result.name).toBe('Cafe');
      expect(result.contactInfo).toBeNull();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: {
          adminActorId: 'admin-1',
          action: 'merchant.created',
          metadata: { merchantId: 'm1' },
        },
      });
    });

    it('rejects an empty name', async () => {
      const { prisma } = makeTxPrisma();
      const service = new MerchantService(prisma as never);
      await expect(
        service.createMerchant({ name: '   ' }, 'admin-1'),
      ).rejects.toThrow('Merchant name is required.');
    });
  });

  describe('updateMerchant', () => {
    it('patches only supplied fields and audits the field names', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.merchant.update.mockResolvedValue(
        merchantRow({ contactInfo: 'wx:cafe', isActive: false }),
      );
      const service = new MerchantService(prisma as never);

      const result = await service.updateMerchant(
        'm1',
        { contactInfo: ' wx:cafe ', isActive: false },
        'admin-1',
      );

      expect(tx.merchant.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { contactInfo: 'wx:cafe', isActive: false },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
        data: {
          adminActorId: 'admin-1',
          action: 'merchant.updated',
          metadata: { merchantId: 'm1', fields: ['contactInfo', 'isActive'] },
        },
      });
      expect(result.isActive).toBe(false);
    });

    it('validates and normalizes promotion blocks before storage', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.merchant.update.mockImplementation(
        ({ data }: { data: { promotionBlocks: unknown } }) =>
          Promise.resolve(
            merchantRow({ promotionBlocks: data.promotionBlocks }),
          ),
      );
      const service = new MerchantService(prisma as never);

      const result = await service.updateMerchant(
        'm1',
        {
          promotionBlocks: [
            { type: 'TEXT', text: ' 关注公众号 ' },
            {
              type: 'QRCODE',
              imageUrl: 'https://cdn.example.com/qr.png',
              caption: ' 扫码 ',
            },
          ],
        },
        'admin-1',
      );

      expect(result.promotionBlocks).toEqual([
        { type: 'TEXT', text: '关注公众号' },
        {
          type: 'QRCODE',
          imageUrl: 'https://cdn.example.com/qr.png',
          caption: '扫码',
        },
      ]);
    });

    it('rejects a non-https image url in promotion blocks', async () => {
      const { prisma } = makeTxPrisma();
      const service = new MerchantService(prisma as never);
      await expect(
        service.updateMerchant(
          'm1',
          { promotionBlocks: [{ type: 'IMAGE', imageUrl: 'http://x/y.png' }] },
          'admin-1',
        ),
      ).rejects.toThrow(/https/);
    });

    it('rejects when no updatable fields are supplied', async () => {
      const { prisma } = makeTxPrisma();
      const service = new MerchantService(prisma as never);
      await expect(service.updateMerchant('m1', {}, 'admin-1')).rejects.toThrow(
        'No updatable fields supplied.',
      );
    });

    it('maps P2025 to a NotFound error', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.merchant.update.mockRejectedValue(
        Object.assign(new Error('not found'), { code: 'P2025' }),
      );
      const service = new MerchantService(prisma as never);
      await expect(
        service.updateMerchant('mX', { isActive: true }, 'admin-1'),
      ).rejects.toThrow('Merchant not found.');
    });
  });

  describe('listMerchants', () => {
    it('paginates, filters active, and returns template/redemption counts', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.merchant.findMany.mockResolvedValue([
        { ...merchantRow(), _count: { templates: 3, redemptions: 7 } },
      ]);
      tx.merchant.count.mockResolvedValue(1);
      const service = new MerchantService(prisma as never);

      const result = await service.listMerchants({
        status: 'active',
        pageSize: 10,
      });

      expect(tx.merchant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
          take: 10,
          include: {
            _count: { select: { templates: true, redemptions: true } },
          },
        }),
      );
      expect(result.items[0].templateCount).toBe(3);
      expect(result.items[0].redemptionCount).toBe(7);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });
  });
});

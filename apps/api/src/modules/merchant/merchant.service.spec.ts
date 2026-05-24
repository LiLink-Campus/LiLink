jest.mock('argon2', () => ({
  hash: jest.fn(),
}));

import * as argon2 from 'argon2';
import { MerchantService } from './merchant.service';

// resetAllMocks (beforeEach) clears the factory implementation, so each test
// that hashes a password re-sets the mock after the reset.
const hashMock = argon2.hash as jest.Mock;

type MockTx = {
  merchant: {
    create: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    findUnique: jest.Mock;
  };
  merchantUser: {
    create: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
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
      findUnique: jest.fn(),
    },
    merchantUser: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
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

  describe('createMerchantUser', () => {
    it('hashes the password, lowercases email, creates the account, and audits', async () => {
      const { prisma, tx } = makeTxPrisma();
      hashMock.mockResolvedValue('hashed-pw');
      tx.merchant.findUnique.mockResolvedValue({ id: 'm1' });
      tx.merchantUser.create.mockImplementation(
        ({
          data,
        }: {
          data: {
            email: string;
            passwordHash: string;
            displayName: string | null;
            role: string;
          };
        }) =>
          Promise.resolve({
            id: 'mu1',
            merchantId: 'm1',
            email: data.email,
            displayName: data.displayName,
            role: data.role,
            isActive: true,
            lastLoginAt: null,
            passwordHash: data.passwordHash,
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
            updatedAt: new Date('2026-05-01T00:00:00.000Z'),
          }),
      );
      const service = new MerchantService(prisma as never);

      const result = await service.createMerchantUser(
        'm1',
        { email: ' Shop@X.com ', password: 'secret12', role: 'OWNER' },
        'admin-1',
      );

      expect(tx.merchantUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            merchantId: 'm1',
            email: 'shop@x.com',
            passwordHash: 'hashed-pw',
            role: 'OWNER',
          }) as object,
        }),
      );
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.email).toBe('shop@x.com');
      expect(tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'merchant_user.created',
          }) as object,
        }),
      );
    });

    it('throws NotFound when the merchant is missing', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.merchant.findUnique.mockResolvedValue(null);
      const service = new MerchantService(prisma as never);
      await expect(
        service.createMerchantUser(
          'mX',
          { email: 'a@b.com', password: 'secret12', role: 'STAFF' },
          'admin-1',
        ),
      ).rejects.toThrow('Merchant not found.');
    });

    it('maps an email unique collision (P2002) to a friendly error', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.merchant.findUnique.mockResolvedValue({ id: 'm1' });
      tx.merchantUser.create.mockRejectedValue(
        Object.assign(new Error('dup'), { code: 'P2002' }),
      );
      const service = new MerchantService(prisma as never);
      await expect(
        service.createMerchantUser(
          'm1',
          { email: 'a@b.com', password: 'secret12', role: 'STAFF' },
          'admin-1',
        ),
      ).rejects.toThrow('A merchant user with this email already exists.');
    });
  });

  describe('updateMerchantUser', () => {
    it('resets the password (re-hash) and audits "password" not the column', async () => {
      const { prisma, tx } = makeTxPrisma();
      hashMock.mockResolvedValue('hashed-pw');
      tx.merchantUser.update.mockResolvedValue({
        id: 'mu1',
        merchantId: 'm1',
        email: 'a@b.com',
        displayName: null,
        role: 'STAFF',
        isActive: true,
        lastLoginAt: null,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
        updatedAt: new Date('2026-05-01T00:00:00.000Z'),
      });
      const service = new MerchantService(prisma as never);

      await service.updateMerchantUser(
        'mu1',
        { password: 'newsecret12' },
        'admin-1',
      );

      expect(tx.merchantUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'mu1' },
          data: { passwordHash: 'hashed-pw' },
        }),
      );
      expect(tx.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: { merchantUserId: 'mu1', fields: ['password'] },
          }) as object,
        }),
      );
    });

    it('maps a merchant user P2025 to NotFound', async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.merchantUser.update.mockRejectedValue(
        Object.assign(new Error('nf'), { code: 'P2025' }),
      );
      const service = new MerchantService(prisma as never);
      await expect(
        service.updateMerchantUser('muX', { isActive: false }, 'admin-1'),
      ).rejects.toThrow('Merchant user not found.');
    });
  });

  describe('listMerchantUsers', () => {
    it("lists a merchant's users without password hashes", async () => {
      const { prisma, tx } = makeTxPrisma();
      tx.merchant.findUnique.mockResolvedValue({ id: 'm1' });
      tx.merchantUser.findMany.mockResolvedValue([
        {
          id: 'mu1',
          merchantId: 'm1',
          email: 'a@b.com',
          displayName: null,
          role: 'OWNER',
          isActive: true,
          lastLoginAt: null,
          passwordHash: 'h',
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          updatedAt: new Date('2026-05-01T00:00:00.000Z'),
        },
      ]);
      const service = new MerchantService(prisma as never);

      const result = await service.listMerchantUsers('m1');

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).not.toHaveProperty('passwordHash');
    });
  });
});

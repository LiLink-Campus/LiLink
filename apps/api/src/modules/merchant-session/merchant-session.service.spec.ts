jest.mock('argon2', () => ({
  verify: jest.fn(),
}));

import * as argon2 from 'argon2';
import { MerchantSessionService } from './merchant-session.service';

const verifyMock = argon2.verify as jest.Mock;

function makePrisma() {
  return {
    merchantUser: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
  };
}

const jwt = { signAsync: jest.fn().mockResolvedValue('signed-token') };

const activeUser = {
  id: 'mu1',
  email: 'shop@x.com',
  displayName: 'Shop',
  role: 'OWNER',
  passwordHash: 'stored-hash',
  isActive: true,
  merchantId: 'm1',
  merchant: { isActive: true, name: 'Cafe' },
};

describe('MerchantSessionService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('login', () => {
    it('issues a token for an active merchant user with the correct password', async () => {
      const prisma = makePrisma();
      prisma.merchantUser.findUnique.mockResolvedValue(activeUser);
      verifyMock.mockResolvedValue(true);
      const service = new MerchantSessionService(jwt as never, prisma as never);

      const result = await service.login(' Shop@X.com ', 'pw');

      expect(prisma.merchantUser.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: 'shop@x.com' } }),
      );
      expect(prisma.merchantUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'mu1' },
          data: { lastLoginAt: expect.any(Date) as Date },
        }),
      );
      expect(result.token).toBe('signed-token');
      expect(result.merchantUser).toEqual({
        id: 'mu1',
        email: 'shop@x.com',
        displayName: 'Shop',
        role: 'OWNER',
        merchantId: 'm1',
        merchantName: 'Cafe',
      });
    });

    it('rejects when the user does not exist (dummy verify still runs)', async () => {
      const prisma = makePrisma();
      prisma.merchantUser.findUnique.mockResolvedValue(null);
      verifyMock.mockResolvedValue(false);
      const service = new MerchantSessionService(jwt as never, prisma as never);

      await expect(service.login('x@x.com', 'pw')).rejects.toThrow(
        'Merchant email or password is invalid.',
      );
      expect(verifyMock).toHaveBeenCalled();
    });

    it('rejects an inactive merchant user', async () => {
      const prisma = makePrisma();
      prisma.merchantUser.findUnique.mockResolvedValue({
        ...activeUser,
        isActive: false,
      });
      verifyMock.mockResolvedValue(true);
      const service = new MerchantSessionService(jwt as never, prisma as never);

      await expect(service.login('shop@x.com', 'pw')).rejects.toThrow(
        /invalid/,
      );
    });

    it('rejects when the merchant is inactive', async () => {
      const prisma = makePrisma();
      prisma.merchantUser.findUnique.mockResolvedValue({
        ...activeUser,
        merchant: { isActive: false, name: 'Cafe' },
      });
      verifyMock.mockResolvedValue(true);
      const service = new MerchantSessionService(jwt as never, prisma as never);

      await expect(service.login('shop@x.com', 'pw')).rejects.toThrow(
        /invalid/,
      );
    });

    it('rejects a wrong password and does not update lastLoginAt', async () => {
      const prisma = makePrisma();
      prisma.merchantUser.findUnique.mockResolvedValue(activeUser);
      verifyMock.mockResolvedValue(false);
      const service = new MerchantSessionService(jwt as never, prisma as never);

      await expect(service.login('shop@x.com', 'pw')).rejects.toThrow(
        /invalid/,
      );
      expect(prisma.merchantUser.update).not.toHaveBeenCalled();
    });
  });

  describe('getMe', () => {
    it('returns the merchant user when active', async () => {
      const prisma = makePrisma();
      prisma.merchantUser.findUnique.mockResolvedValue({
        id: 'mu1',
        email: 'shop@x.com',
        displayName: 'Shop',
        role: 'STAFF',
        isActive: true,
        merchantId: 'm1',
        merchant: { isActive: true, name: 'Cafe' },
      });
      const service = new MerchantSessionService(jwt as never, prisma as never);

      const result = await service.getMe('mu1');

      expect(result.ok).toBe(true);
      expect(result.merchantUser.merchantName).toBe('Cafe');
    });

    it('rejects when the merchant user is inactive', async () => {
      const prisma = makePrisma();
      prisma.merchantUser.findUnique.mockResolvedValue({
        isActive: false,
        merchant: { isActive: true, name: 'Cafe' },
      });
      const service = new MerchantSessionService(jwt as never, prisma as never);

      await expect(service.getMe('mu1')).rejects.toThrow(/invalid/);
    });
  });
});

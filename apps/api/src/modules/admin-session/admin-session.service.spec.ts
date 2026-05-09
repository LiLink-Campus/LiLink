import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { adminSessionConfig } from '../../common/auth/session-config';
import { env } from '../../config/env';
import { AdminSessionService } from './admin-session.service';

jest.mock('argon2', () => ({
  verify: jest.fn(),
}));

describe('AdminSessionService', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('rejects invalid credentials', async () => {
    const prisma = {
      adminOperator: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const jwtService = {
      signAsync: jest.fn(),
    };
    const service = new AdminSessionService(
      jwtService as never,
      prisma as never,
    );

    jest.mocked(argon2.verify).mockResolvedValue(false as never);

    await expect(
      service.login('admin@example.com', 'bad-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(argon2.verify).toHaveBeenCalledTimes(1);
  });

  it('rejects inactive operators after verifying the dummy hash path', async () => {
    const prisma = {
      adminOperator: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'admin-1',
          email: 'admin@example.com',
          displayName: 'Ops',
          passwordHash: 'real-hash',
          isActive: false,
        }),
      },
    };
    const jwtService = {
      signAsync: jest.fn(),
    };
    const service = new AdminSessionService(
      jwtService as never,
      prisma as never,
    );

    jest.mocked(argon2.verify).mockResolvedValue(true as never);

    await expect(
      service.login('admin@example.com', 'any-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(argon2.verify).toHaveBeenCalledTimes(1);
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('returns a token and admin profile for valid credentials', async () => {
    const prisma = {
      adminOperator: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'admin-1',
          email: 'admin@example.com',
          displayName: 'Ops',
          passwordHash: 'hash',
          isActive: true,
        }),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    const jwtService = {
      signAsync: jest.fn().mockResolvedValue('admin-token'),
    };
    const service = new AdminSessionService(
      jwtService as never,
      prisma as never,
    );

    jest.mocked(argon2.verify).mockResolvedValue(true as never);

    await expect(
      service.login('admin@example.com', 'correct-password'),
    ).resolves.toEqual({
      token: 'admin-token',
      admin: {
        id: 'admin-1',
        email: 'admin@example.com',
        displayName: 'Ops',
      },
    });

    expect(jwtService.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'admin-1',
        email: 'admin@example.com',
      }),
      expect.objectContaining({
        secret: env.ADMIN_JWT_SECRET,
        expiresIn: adminSessionConfig.jwtExpiresIn,
      }),
    );
  });
});

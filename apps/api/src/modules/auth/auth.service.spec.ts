jest.mock('argon2', () => ({
  hash: jest.fn(),
  verify: jest.fn(),
}));

import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { validateSync } from 'class-validator';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto';

const mockedArgon2 = argon2 as jest.Mocked<typeof argon2>;

type RegisterTransaction = {
  emailCode: {
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
  user: {
    create: jest.Mock;
  };
};

describe('AuthService', () => {
  beforeEach(() => {
    mockedArgon2.hash.mockReset();
    mockedArgon2.verify.mockReset();
  });

  it('rejects login for non-active users before issuing a token', async () => {
    const authService = new AuthService(
      {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'user-1',
            email: 'user@example.com',
            passwordHash: 'hash',
            status: 'PENDING',
          }),
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      authService.login({
        email: 'user@example.com',
        password: 'Password123',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechecks the email domain during registration', async () => {
    const findFirst = jest.fn();
    const authService = new AuthService(
      {
        emailCode: {
          findFirst,
        },
      } as never,
      {} as never,
      {
        resolveByEmail: jest.fn().mockResolvedValue(null),
      } as never,
      {} as never,
    );

    await expect(
      authService.register({
        email: 'user@invalid.example',
        code: '123456',
        password: 'Password123',
        displayName: 'User',
        acceptedTerms: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('queues and flushes a verification email before returning success', async () => {
    mockedArgon2.hash.mockResolvedValue('hashed-code');

    const create = jest.fn().mockResolvedValue({
      id: 'code-1',
      email: 'user@example.com',
      deliveryStatus: 'PENDING',
    });
    const outboundCreate = jest.fn().mockResolvedValue(undefined);
    const findUnique = jest.fn().mockResolvedValue({
      id: 'code-1',
      deliveryStatus: 'SENT',
    });
    const flushQueuedEmails = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      emailCode: {
        findUnique,
      },
      $transaction: jest.fn(
        async (
          callback: (transaction: {
            emailCode: { create: typeof create };
            outboundEmail: { create: typeof outboundCreate };
          }) => Promise<unknown>,
        ) =>
          callback({
            emailCode: { create },
            outboundEmail: { create: outboundCreate },
          }),
      ),
    };
    const authService = new AuthService(
      prisma as never,
      {
        buildVerificationCodeEmail: jest.fn((input) => ({
          dedupeKey: input.dedupeKey,
          recipientEmail: input.recipientEmail,
          subject: 'LiLink verification code',
          html: '<p>Code</p>',
          maxAttempts: 1,
        })),
        flushQueuedEmails,
      } as never,
      {
        resolveByEmail: jest.fn().mockResolvedValue({ schoolId: 'school-1' }),
      } as never,
      {} as never,
    );

    const result = await authService.requestCode('user@example.com');

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'user@example.com',
          deliveryDedupeKey: expect.stringMatching(/^verification-code:/),
        }),
      }),
    );
    expect(outboundCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dedupeKey: expect.stringMatching(/^verification-code:/),
          recipientEmail: 'user@example.com',
          maxAttempts: 1,
        }),
      }),
    );
    expect(flushQueuedEmails).toHaveBeenCalledWith({
      dedupeKeys: [expect.stringMatching(/^verification-code:/)],
    });
    expect(result).toMatchObject({
      email: 'user@example.com',
      school: { schoolId: 'school-1' },
    });
  });

  it('rejects requestCode when the verification email could not be delivered', async () => {
    mockedArgon2.hash.mockResolvedValue('hashed-code');

    const flushQueuedEmails = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      emailCode: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'code-1',
          deliveryStatus: 'FAILED',
        }),
      },
      $transaction: jest.fn(
        async (
          callback: (transaction: {
            emailCode: { create: jest.Mock };
            outboundEmail: { create: jest.Mock };
          }) => Promise<unknown>,
        ) =>
          callback({
            emailCode: {
              create: jest.fn().mockResolvedValue({ id: 'code-1' }),
            },
            outboundEmail: {
              create: jest.fn().mockResolvedValue(undefined),
            },
          }),
      ),
    };
    const authService = new AuthService(
      prisma as never,
      {
        buildVerificationCodeEmail: jest.fn((input) => ({
          dedupeKey: input.dedupeKey,
          recipientEmail: input.recipientEmail,
          subject: 'LiLink verification code',
          html: '<p>Code</p>',
          maxAttempts: 1,
        })),
        flushQueuedEmails,
      } as never,
      {
        resolveByEmail: jest.fn().mockResolvedValue({ schoolId: 'school-1' }),
      } as never,
      {} as never,
    );

    await expect(
      authService.requestCode('user@example.com'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects passwords that exceed the configured maximum length', () => {
    const validationErrors = validateSync(
      Object.assign(new RegisterDto(), {
        email: 'user@example.com',
        code: '123456',
        password: 'A'.repeat(129),
        displayName: 'User',
        acceptedTerms: true,
      }),
    );

    expect(
      validationErrors.some((error) => error.property === 'password'),
    ).toBe(true);
  });

  it('does not consume the verification code when the code is invalid', async () => {
    const emailCodeFindFirst = jest.fn().mockResolvedValue({
      id: 'code-1',
      codeHash: 'hash',
    });
    const emailCodeUpdateMany = jest.fn();
    const userCreate = jest.fn();
    const tx: RegisterTransaction = {
      emailCode: {
        findFirst: emailCodeFindFirst,
        updateMany: emailCodeUpdateMany,
      },
      user: {
        create: userCreate,
      },
    };
    const prisma = {
      emailCode: {
        findFirst: emailCodeFindFirst,
      },
      user: {
        create: userCreate,
        count: jest.fn().mockResolvedValue(0),
      },
      systemSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(
        async (
          callback: (transaction: RegisterTransaction) => Promise<unknown>,
        ) => callback(tx),
      ),
    };
    const authService = new AuthService(
      prisma as never,
      {} as never,
      {
        resolveByEmail: jest.fn().mockResolvedValue({ schoolId: 'school-1' }),
      } as never,
      {
        sign: jest.fn(),
      } as never,
    );

    mockedArgon2.verify.mockResolvedValue(false);

    await expect(
      authService.register({
        email: 'user@example.com',
        code: '123456',
        password: 'Password123',
        displayName: 'User',
        acceptedTerms: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(emailCodeUpdateMany).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
  });

  it('maps unique constraint failures to a friendly registration error', async () => {
    const emailCodeFindFirst = jest.fn().mockResolvedValue({
      id: 'code-1',
      codeHash: 'hash',
    });
    const emailCodeUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
    const userCreate = jest.fn().mockRejectedValue({ code: 'P2002' });
    const tx: RegisterTransaction = {
      emailCode: {
        findFirst: emailCodeFindFirst,
        updateMany: emailCodeUpdateMany,
      },
      user: {
        create: userCreate,
      },
    };
    const prisma = {
      emailCode: {
        findFirst: emailCodeFindFirst,
      },
      user: {
        create: userCreate,
        count: jest.fn().mockResolvedValue(0),
      },
      systemSetting: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(
        async (
          callback: (transaction: RegisterTransaction) => Promise<unknown>,
        ) => callback(tx),
      ),
    };
    const authService = new AuthService(
      prisma as never,
      {} as never,
      {
        resolveByEmail: jest.fn().mockResolvedValue({ schoolId: 'school-1' }),
      } as never,
      {
        sign: jest.fn(),
      } as never,
    );

    mockedArgon2.verify.mockResolvedValue(true);
    mockedArgon2.hash.mockResolvedValue('hashed-password');

    await expect(
      authService.register({
        email: 'user@example.com',
        code: '123456',
        password: 'Password123',
        displayName: 'User',
        acceptedTerms: true,
      }),
    ).rejects.toMatchObject({
      message: 'This email is already registered.',
    });
    expect(emailCodeUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'code-1',
          consumedAt: null,
        },
      }),
    );
  });
});

jest.mock('argon2', () => ({
  hash: jest.fn(),
  verify: jest.fn(),
}));

import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { validateSync } from 'class-validator';
import { createHmac } from 'crypto';
import * as argon2 from 'argon2';
import { env } from '../../config/env';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto';

const mockedArgon2 = argon2 as jest.Mocked<typeof argon2>;
const VERIFICATION_CODE_HMAC_CONTEXT = 'verification-code';

function createVerificationCodeDigest(input: {
  email: string;
  purpose: 'register' | 'password_reset';
  deliveryDedupeKey: string;
  code: string;
}) {
  return createHmac('sha256', env.JWT_SECRET)
    .update(VERIFICATION_CODE_HMAC_CONTEXT)
    .update('\n')
    .update(input.purpose)
    .update('\n')
    .update(input.email)
    .update('\n')
    .update(input.deliveryDedupeKey)
    .update('\n')
    .update(input.code)
    .digest('hex');
}

type RegisterTransaction = {
  emailCode: {
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
  user: {
    create: jest.Mock;
  };
};

type VerificationCodeTransaction = {
  emailCode: {
    create: jest.Mock;
    updateMany: jest.Mock;
  };
  outboundEmail: {
    create: jest.Mock;
  };
};

type ResetPasswordTransaction = {
  emailCode: {
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
  user: {
    findUnique: jest.Mock;
    update: jest.Mock;
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

  it('rejects requestCode when the email domain does not resolve to a configured school', async () => {
    const buildVerificationCodeEmail = jest.fn();
    const authService = new AuthService(
      {} as never,
      {
        buildVerificationCodeEmail,
      } as never,
      {
        resolveByEmail: jest.fn().mockResolvedValue(null),
      } as never,
      {} as never,
    );

    await expect(
      authService.requestCode('user@invalid.example'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(buildVerificationCodeEmail).not.toHaveBeenCalled();
  });

  it('queues a verification email and kicks off async delivery', async () => {
    const create = jest.fn().mockResolvedValue({
      id: 'code-1',
      email: 'user@example.com',
      deliveryStatus: 'PENDING',
    });
    const invalidateExistingCodes = jest.fn().mockResolvedValue({ count: 0 });
    const outboundCreate = jest.fn().mockResolvedValue(undefined);
    const deliverQueuedEmailNow = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      $transaction: jest.fn(
        async (
          callback: (
            transaction: VerificationCodeTransaction,
          ) => Promise<unknown>,
        ) =>
          callback({
            emailCode: {
              create,
              updateMany: invalidateExistingCodes,
            },
            outboundEmail: { create: outboundCreate },
          }),
      ),
    };
    const resolveByEmail = jest
      .fn()
      .mockResolvedValue({ schoolId: 'school-1' });
    const authService = new AuthService(
      prisma as never,
      {
        buildVerificationCodeEmail: jest.fn(
          (input: {
            dedupeKey: string;
            recipientEmail: string;
            code: string;
          }) => ({
            dedupeKey: input.dedupeKey,
            recipientEmail: input.recipientEmail,
            subject: 'LiLink verification code',
            html: '<p>Code</p>',
            maxAttempts: 3,
          }),
        ),
        deliverQueuedEmailNow,
      } as never,
      {
        resolveByEmail,
      } as never,
      {} as never,
    );

    const result = await authService.requestCode('user@example.com');

    expect(create).toHaveBeenCalledTimes(1);
    const createCalls = create.mock.calls as unknown as Array<
      [{ data: { email: string; deliveryDedupeKey: string } }]
    >;
    const createPayload = createCalls[0]?.[0];
    expect(createPayload?.data.email).toBe('user@example.com');
    expect(createPayload?.data.deliveryDedupeKey).toMatch(
      /^verification-code:/,
    );
    expect(invalidateExistingCodes).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: 'user@example.com',
          purpose: 'register',
        }) as object,
      }) as object,
    );

    expect(outboundCreate).toHaveBeenCalledTimes(1);
    const outboundCalls = outboundCreate.mock.calls as unknown as Array<
      [
        {
          data: {
            dedupeKey: string;
            recipientEmail: string;
            maxAttempts: number;
          };
        },
      ]
    >;
    const outboundPayload = outboundCalls[0]?.[0];
    expect(outboundPayload?.data.dedupeKey).toMatch(/^verification-code:/);
    expect(outboundPayload?.data.recipientEmail).toBe('user@example.com');
    expect(outboundPayload?.data.maxAttempts).toBe(3);

    expect(deliverQueuedEmailNow).toHaveBeenCalledTimes(1);
    const [[deliveryDedupeKey]] = deliverQueuedEmailNow.mock.calls as [
      [string],
    ];
    expect(deliveryDedupeKey).toMatch(/^verification-code:/);
    expect(resolveByEmail).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      email: 'user@example.com',
      school: { schoolId: 'school-1' },
    });
  });

  it('swallows immediate-delivery failures so the request still succeeds', async () => {
    const invalidateExistingCodes = jest.fn().mockResolvedValue({ count: 0 });
    // Reject the immediate kick-off; cron should later retry via maxAttempts.
    const deliverQueuedEmailNow = jest
      .fn()
      .mockRejectedValue(new Error('SMTP temporarily unavailable'));
    const prisma = {
      $transaction: jest.fn(
        async (
          callback: (
            transaction: VerificationCodeTransaction,
          ) => Promise<unknown>,
        ) =>
          callback({
            emailCode: {
              create: jest.fn().mockResolvedValue({ id: 'code-1' }),
              updateMany: invalidateExistingCodes,
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
        buildVerificationCodeEmail: jest.fn(
          (input: {
            dedupeKey: string;
            recipientEmail: string;
            code: string;
          }) => ({
            dedupeKey: input.dedupeKey,
            recipientEmail: input.recipientEmail,
            subject: 'LiLink verification code',
            html: '<p>Code</p>',
            maxAttempts: 3,
          }),
        ),
        deliverQueuedEmailNow,
      } as never,
      {
        resolveByEmail: jest.fn().mockResolvedValue({ schoolId: 'school-1' }),
      } as never,
      {} as never,
    );

    await expect(
      authService.requestCode('user@example.com'),
    ).resolves.toMatchObject({ email: 'user@example.com' });

    expect(deliverQueuedEmailNow).toHaveBeenCalledTimes(1);
    // Allow the fire-and-forget `.catch` handler to run so the Logger is
    // flushed before the test exits (prevents unhandled rejection warnings).
    await new Promise((resolve) => setImmediate(resolve));
  });

  it('allows password reset for an existing user even when the email domain is no longer accepted', async () => {
    const resolveByEmail = jest.fn();
    const create = jest.fn().mockResolvedValue({
      id: 'code-1',
      email: 'user@legacy.invalid',
      deliveryStatus: 'PENDING',
    });
    const invalidateExistingCodes = jest.fn().mockResolvedValue({ count: 0 });
    const outboundCreate = jest.fn().mockResolvedValue(undefined);
    const deliverQueuedEmailNow = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'user@legacy.invalid',
          status: 'ACTIVE',
        }),
      },
      emailCode: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'code-1',
          deliveryStatus: 'SENT',
        }),
      },
      $transaction: jest.fn(
        async (
          callback: (
            transaction: VerificationCodeTransaction,
          ) => Promise<unknown>,
        ) =>
          callback({
            emailCode: {
              create,
              updateMany: invalidateExistingCodes,
            },
            outboundEmail: { create: outboundCreate },
          }),
      ),
    };
    const authService = new AuthService(
      prisma as never,
      {
        buildVerificationCodeEmail: jest.fn(
          (input: {
            dedupeKey: string;
            recipientEmail: string;
            code: string;
          }) => ({
            dedupeKey: input.dedupeKey,
            recipientEmail: input.recipientEmail,
            subject: 'LiLink verification code',
            html: '<p>Code</p>',
            maxAttempts: 3,
          }),
        ),
        deliverQueuedEmailNow,
      } as never,
      {
        resolveByEmail,
      } as never,
      {} as never,
    );

    await expect(
      authService.requestPasswordResetCode('user@legacy.invalid'),
    ).resolves.toMatchObject({
      email: 'user@legacy.invalid',
    });
    expect(resolveByEmail).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('returns a neutral response for unknown password-reset emails without queuing mail', async () => {
    const buildVerificationCodeEmail = jest.fn();
    const deliverQueuedEmailNow = jest.fn();
    const authService = new AuthService(
      {
        user: {
          findUnique: jest.fn().mockResolvedValue(null),
        },
      } as never,
      {
        buildVerificationCodeEmail,
        deliverQueuedEmailNow,
      } as never,
      {} as never,
      {} as never,
    );

    const result = await authService.requestPasswordResetCode(
      'missing@example.com',
    );

    expect(result.email).toBe('missing@example.com');
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(buildVerificationCodeEmail).not.toHaveBeenCalled();
    expect(deliverQueuedEmailNow).not.toHaveBeenCalled();
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
      codeHash: 'wrong-digest',
      deliveryDedupeKey: 'verification-code:test',
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
    const deliveryDedupeKey = 'verification-code:test';
    const emailCodeFindFirst = jest.fn().mockResolvedValue({
      id: 'code-1',
      codeHash: createVerificationCodeDigest({
        email: 'user@example.com',
        purpose: 'register',
        deliveryDedupeKey,
        code: '123456',
      }),
      deliveryDedupeKey,
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

  it('rejects password reset for suspended users before consuming the code or updating the password', async () => {
    const emailCodeFindFirst = jest.fn();
    const emailCodeUpdateMany = jest.fn();
    const userFindUnique = jest.fn().mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      status: 'SUSPENDED',
    });
    const userUpdate = jest.fn();
    const tx: ResetPasswordTransaction = {
      emailCode: {
        findFirst: emailCodeFindFirst,
        updateMany: emailCodeUpdateMany,
      },
      user: {
        findUnique: userFindUnique,
        update: userUpdate,
      },
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'user@example.com',
          status: 'SUSPENDED',
        }),
      },
      $transaction: jest.fn(
        async (
          callback: (transaction: ResetPasswordTransaction) => Promise<unknown>,
        ) => callback(tx),
      ),
    };
    const authService = new AuthService(
      prisma as never,
      {} as never,
      {} as never,
      {
        sign: jest.fn(),
      } as never,
    );

    await expect(
      authService.resetPassword({
        email: 'user@example.com',
        code: '123456',
        newPassword: 'Password123',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(emailCodeFindFirst).not.toHaveBeenCalled();
    expect(emailCodeUpdateMany).not.toHaveBeenCalled();
    expect(userUpdate).not.toHaveBeenCalled();
    expect(mockedArgon2.hash).not.toHaveBeenCalled();
  });
});

import { LOCALE_COOKIE_NAME } from '@lilink/shared';
import { userSessionConfig } from '../../common/auth/session-config';
import { env } from '../../config/env';
import { AuthController } from './auth.controller';

describe('AuthController', () => {
  it('forwards requestCode to AuthService with the submitted email', async () => {
    const requestCode = jest.fn().mockResolvedValue({
      email: 'user@example.com',
      expiresAt: new Date(),
      school: { schoolId: 'school-1' },
    });
    const authController = new AuthController({
      requestCode,
    } as never);

    await expect(
      authController.requestCode({ email: 'user@example.com' }),
    ).resolves.toMatchObject({
      email: 'user@example.com',
      school: { schoolId: 'school-1' },
    });

    expect(requestCode).toHaveBeenCalledTimes(1);
    expect(requestCode).toHaveBeenCalledWith('user@example.com', undefined);
  });

  it('forwards requestCode to AuthService with the submitted referral code', async () => {
    const requestCode = jest.fn().mockResolvedValue({
      email: 'user@qq.com',
      expiresAt: new Date(),
      school: null,
    });
    const authController = new AuthController({
      requestCode,
    } as never);

    await authController.requestCode({
      email: 'user@qq.com',
      referralCode: 'VALIDCODE1',
    });

    expect(requestCode).toHaveBeenCalledTimes(1);
    expect(requestCode).toHaveBeenCalledWith('user@qq.com', 'VALIDCODE1');
  });

  it('strips the token from the login response body while still setting the cookie', async () => {
    const authController = new AuthController({
      login: jest.fn().mockResolvedValue({
        token: 'jwt-token',
        user: {
          id: 'user-1',
          email: 'user@example.com',
          displayName: 'User',
        },
      }),
    } as never);
    const response = {
      cookie: jest.fn(),
    };

    await expect(
      authController.login(
        {
          email: 'user@example.com',
          password: 'Password123',
        },
        { cookies: {} } as never,
        response as never,
      ),
    ).resolves.toEqual({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        displayName: 'User',
      },
    });
    expect(response.cookie).toHaveBeenCalledWith(env.COOKIE_NAME, 'jwt-token', {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.APP_ENV === 'production',
      domain: env.COOKIE_DOMAIN || undefined,
      maxAge: userSessionConfig.cookieMaxAgeMs,
      path: '/',
    });
  });

  it('strips the token from the register response body while still setting the cookie', async () => {
    const authController = new AuthController({
      register: jest.fn().mockResolvedValue({
        token: 'jwt-token',
        user: {
          id: 'user-1',
          email: 'user@example.com',
          displayName: 'User',
        },
      }),
    } as never);
    const response = {
      cookie: jest.fn(),
    };

    await expect(
      authController.register(
        {
          email: 'user@example.com',
          code: '123456',
          password: 'Password123',
          displayName: 'User',
          acceptedTerms: true,
        },
        { cookies: {} } as never,
        response as never,
      ),
    ).resolves.toEqual({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        displayName: 'User',
      },
    });
    expect(response.cookie).toHaveBeenCalled();
  });

  it('strips the token from the reset-password response body while still setting the cookie', async () => {
    const authController = new AuthController({
      resetPassword: jest.fn().mockResolvedValue({
        token: 'jwt-token',
        user: {
          id: 'user-1',
          email: 'user@example.com',
          displayName: 'User',
        },
      }),
    } as never);
    const response = {
      cookie: jest.fn(),
    };

    await expect(
      authController.resetPassword(
        {
          email: 'user@example.com',
          code: '123456',
          newPassword: 'Password123',
        },
        { cookies: {} } as never,
        response as never,
      ),
    ).resolves.toEqual({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        displayName: 'User',
      },
    });
    expect(response.cookie).toHaveBeenCalled();
  });

  it('passes only a supported locale cookie into login', async () => {
    const login = jest.fn().mockResolvedValue({
      token: 'jwt-token',
      user: {
        id: 'user-1',
        email: 'user@example.com',
        displayName: 'User',
      },
    });
    const authController = new AuthController({ login } as never);
    const response = {
      cookie: jest.fn(),
    };

    await authController.login(
      {
        email: 'user@example.com',
        password: 'Password123',
      },
      { cookies: { [LOCALE_COOKIE_NAME]: 'en-US' } } as never,
      response as never,
    );

    expect(login).toHaveBeenCalledWith(
      {
        email: 'user@example.com',
        password: 'Password123',
      },
      'en-US',
    );

    await authController.login(
      {
        email: 'user@example.com',
        password: 'Password123',
      },
      { cookies: { [LOCALE_COOKIE_NAME]: 'fr-FR' } } as never,
      response as never,
    );

    expect(login).toHaveBeenLastCalledWith(
      {
        email: 'user@example.com',
        password: 'Password123',
      },
      null,
    );
  });

  it('passes the supported locale cookie into register and reset-password', async () => {
    const register = jest.fn().mockResolvedValue({
      token: 'jwt-token',
      user: { id: 'user-1', email: 'user@example.com' },
    });
    const resetPassword = jest.fn().mockResolvedValue({
      token: 'jwt-token',
      user: { id: 'user-1', email: 'user@example.com' },
    });
    const authController = new AuthController({
      register,
      resetPassword,
    } as never);
    const response = {
      cookie: jest.fn(),
    };
    const request = {
      cookies: { [LOCALE_COOKIE_NAME]: 'en-US' },
    };

    await authController.register(
      {
        email: 'user@example.com',
        code: '123456',
        password: 'Password123',
        displayName: 'User',
        acceptedTerms: true,
      },
      request as never,
      response as never,
    );
    await authController.resetPassword(
      {
        email: 'user@example.com',
        code: '123456',
        newPassword: 'Password123',
      },
      request as never,
      response as never,
    );

    expect(register).toHaveBeenCalledWith(
      {
        email: 'user@example.com',
        code: '123456',
        password: 'Password123',
        displayName: 'User',
        acceptedTerms: true,
      },
      'en-US',
    );
    expect(resetPassword).toHaveBeenCalledWith(
      {
        email: 'user@example.com',
        code: '123456',
        newPassword: 'Password123',
      },
      'en-US',
    );
  });
});

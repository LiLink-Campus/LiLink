import { env } from '../../config/env';
import { AdminSessionController } from './admin-session.controller';

describe('AdminSessionController', () => {
  it('strips the token from the login response body while still setting the cookie', async () => {
    const adminSessionController = new AdminSessionController({
      login: jest.fn().mockResolvedValue({
        token: 'admin-jwt-token',
        admin: {
          id: 'admin-1',
          email: 'admin@example.com',
          displayName: 'Ops',
        },
      }),
    } as never);
    const response = {
      cookie: jest.fn(),
    };

    await expect(
      adminSessionController.login(
        {
          email: 'admin@example.com',
          password: 'Password123',
        },
        response as never,
      ),
    ).resolves.toEqual({
      ok: true,
      admin: {
        id: 'admin-1',
        email: 'admin@example.com',
        displayName: 'Ops',
      },
    });

    expect(response.cookie).toHaveBeenCalledWith(
      env.ADMIN_COOKIE_NAME,
      'admin-jwt-token',
      {
        httpOnly: true,
        sameSite: 'lax',
        secure: env.APP_ENV === 'production',
        domain: env.COOKIE_DOMAIN || undefined,
        maxAge: 1000 * 60 * 60 * 12,
        path: '/',
      },
    );
  });
});

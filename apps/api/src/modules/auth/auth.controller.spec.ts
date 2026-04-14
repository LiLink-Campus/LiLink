import { AuthController } from './auth.controller';

describe('AuthController', () => {
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
});

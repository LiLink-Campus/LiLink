import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService', () => {
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
});

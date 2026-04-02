import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  it('maps token verification failures to UnauthorizedException', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockRejectedValue(new Error('jwt malformed')),
    };
    const prisma = {
      user: {
        findUnique: jest.fn(),
      },
    };
    const guard = new JwtAuthGuard(jwtService as never, prisma as never);
    const request = {
      cookies: { lilink_token: 'token' },
      headers: {},
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    };

    await expect(guard.canActivate(context as never)).rejects.toMatchObject({
      message: 'Authentication token is invalid.',
    } satisfies Partial<UnauthorizedException>);
  });

  it('rejects inactive users after token verification', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user-1',
        email: 'user@example.com',
      }),
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'user@example.com',
          status: 'SUSPENDED',
        }),
      },
    };
    const guard = new JwtAuthGuard(jwtService as never, prisma as never);
    const request = {
      cookies: { lilink_token: 'token' },
      headers: {},
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    };

    await expect(guard.canActivate(context as never)).rejects.toMatchObject({
      message: 'Account is not active.',
    } satisfies Partial<UnauthorizedException>);
  });

  it('attaches the active user to the request', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user-1',
        email: 'token@example.com',
      }),
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'active@example.com',
          status: 'ACTIVE',
        }),
      },
    };
    const guard = new JwtAuthGuard(jwtService as never, prisma as never);
    const request: {
      cookies: Record<string, string>;
      headers: Record<string, string>;
      user?: { sub: string; email: string };
    } = {
      cookies: { lilink_token: 'token' },
      headers: {},
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    };

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(request.user).toEqual({
      sub: 'user-1',
      email: 'active@example.com',
    });
  });
});

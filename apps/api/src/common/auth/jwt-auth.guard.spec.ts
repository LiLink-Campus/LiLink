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
          displayName: 'Active User',
          status: 'ACTIVE',
        }),
      },
    };
    const guard = new JwtAuthGuard(jwtService as never, prisma as never);
    const request: {
      cookies: Record<string, string>;
      headers: Record<string, string>;
      user?: { sub: string; email: string; displayName: string | null };
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
      displayName: 'Active User',
    });
  });

  it('deduplicates concurrent active-user lookups without caching status', async () => {
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
          displayName: 'Active User',
          status: 'ACTIVE',
        }),
      },
    };
    const guard = new JwtAuthGuard(jwtService as never, prisma as never);
    const createContext = () => {
      const request: {
        cookies: Record<string, string>;
        headers: Record<string, string>;
        user?: { sub: string; email: string; displayName: string | null };
      } = {
        cookies: { lilink_token: 'token' },
        headers: {},
      };

      return {
        request,
        context: {
          switchToHttp: () => ({
            getRequest: () => request,
          }),
        },
      };
    };
    const first = createContext();
    const second = createContext();

    await expect(
      Promise.all([
        guard.canActivate(first.context as never),
        guard.canActivate(second.context as never),
      ]),
    ).resolves.toEqual([true, true]);

    const third = createContext();
    await expect(guard.canActivate(third.context as never)).resolves.toBe(true);

    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
    expect(first.request.user).toEqual(second.request.user);
    expect(third.request.user).toEqual(first.request.user);
  });

  it('rejects users suspended after a previous active request', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user-1',
        email: 'token@example.com',
      }),
    };
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'user-1',
            email: 'active@example.com',
            displayName: 'Active User',
            status: 'ACTIVE',
          })
          .mockResolvedValueOnce({
            id: 'user-1',
            email: 'active@example.com',
            displayName: 'Active User',
            status: 'SUSPENDED',
          }),
      },
    };
    const guard = new JwtAuthGuard(jwtService as never, prisma as never);
    const createContext = () => ({
      switchToHttp: () => ({
        getRequest: () => ({
          cookies: { lilink_token: 'token' },
          headers: {},
        }),
      }),
    });

    await expect(guard.canActivate(createContext() as never)).resolves.toBe(
      true,
    );
    await expect(
      guard.canActivate(createContext() as never),
    ).rejects.toMatchObject({
      message: 'Account is not active.',
    } satisfies Partial<UnauthorizedException>);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
  });
});

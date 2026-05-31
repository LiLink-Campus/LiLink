import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('maps token verification failures to UnauthorizedException', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockRejectedValue(new Error('jwt malformed')),
    };
    const prisma = {
      user: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
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
          lastActiveAt: null,
        }),
        updateMany: jest.fn(),
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
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('attaches the active user to the request', async () => {
    const recentActiveAt = new Date();
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
          lastActiveAt: recentActiveAt,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('touches stale active users with a one-hour database throttle', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-31T12:00:00.000Z'));
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user-1',
        email: 'token@example.com',
      }),
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'active@example.com',
          displayName: 'Active User',
          status: 'ACTIVE',
          lastActiveAt: new Date('2026-05-31T10:30:00.000Z'),
        }),
        updateMany,
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

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
        status: 'ACTIVE',
        OR: [
          { lastActiveAt: null },
          { lastActiveAt: { lt: new Date('2026-05-31T11:00:00.000Z') } },
        ],
      },
      data: { lastActiveAt: new Date('2026-05-31T12:00:00.000Z') },
    });
  });

  it('touches active users without a previous activity timestamp', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'user-1',
        email: 'token@example.com',
      }),
    };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'active@example.com',
          displayName: 'Active User',
          status: 'ACTIVE',
          lastActiveAt: null,
        }),
        updateMany,
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

    await expect(guard.canActivate(context as never)).resolves.toBe(true);

    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it('does not fail authentication when recording activity fails', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
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
          lastActiveAt: null,
        }),
        updateMany: jest.fn().mockRejectedValue(new Error('database down')),
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

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to record user activity for user-1: database down',
    );
    warnSpy.mockRestore();
  });

  it('deduplicates concurrent active-user lookups without caching status', async () => {
    const recentActiveAt = new Date();
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
          lastActiveAt: recentActiveAt,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(first.request.user).toEqual(second.request.user);
    expect(third.request.user).toEqual(first.request.user);
  });

  it('rejects users suspended after a previous active request', async () => {
    const recentActiveAt = new Date();
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
            lastActiveAt: recentActiveAt,
          })
          .mockResolvedValueOnce({
            id: 'user-1',
            email: 'active@example.com',
            displayName: 'Active User',
            status: 'SUSPENDED',
            lastActiveAt: recentActiveAt,
          }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });
});

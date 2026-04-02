import { UnauthorizedException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  it('attaches the active admin operator to the request', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'admin-1',
        email: 'admin@example.com',
      }),
    };
    const prisma = {
      adminOperator: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'admin-1',
          email: 'admin@example.com',
          displayName: 'Ops',
          isActive: true,
        }),
      },
    };
    const guard = new AdminGuard(jwtService as never, prisma as never);
    const request: {
      cookies: Record<string, string>;
      headers: Record<string, string>;
      admin?: { id: string; email: string; displayName: string | null };
    } = {
      cookies: { lilink_admin_token: 'admin-token' },
      headers: {},
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    };

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(request.admin).toEqual({
      id: 'admin-1',
      email: 'admin@example.com',
      displayName: 'Ops',
    });
  });

  it('rejects inactive admin operators', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'admin-1',
        email: 'admin@example.com',
      }),
    };
    const prisma = {
      adminOperator: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'admin-1',
          email: 'admin@example.com',
          displayName: 'Ops',
          isActive: false,
        }),
      },
    };
    const guard = new AdminGuard(jwtService as never, prisma as never);
    const request = {
      cookies: { lilink_admin_token: 'admin-token' },
      headers: {},
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    };

    await expect(guard.canActivate(context as never)).rejects.toMatchObject({
      message: 'Admin session is invalid.',
    } satisfies Partial<UnauthorizedException>);
  });
});

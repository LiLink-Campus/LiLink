import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { env } from '../../config/env';
import { PrismaService } from '../prisma/prisma.service';

type AuthenticatedUser = {
  sub: string;
  email: string;
  displayName: string | null;
};

type ActiveAuthenticatedUser = AuthenticatedUser & {
  lastActiveAt: Date | null;
};

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

const USER_ACTIVITY_UPDATE_THROTTLE_MS = 60 * 60 * 1000;

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private readonly pendingUserLoads = new Map<
    string,
    Promise<ActiveAuthenticatedUser>
  >();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const cookies = request.cookies as Record<string, unknown> | undefined;
    const rawCookieToken = cookies?.[env.COOKIE_NAME];
    const token =
      typeof rawCookieToken === 'string' ? rawCookieToken : undefined;

    if (!token) {
      throw new UnauthorizedException('Authentication token is required.');
    }

    let payload: {
      sub: string;
      email: string;
    };

    try {
      payload = await this.jwtService.verifyAsync<{
        sub: string;
        email: string;
      }>(token, {
        secret: env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Authentication token is invalid.');
    }

    const user = await this.loadActiveUser(payload.sub);
    request.user = {
      sub: user.sub,
      email: user.email,
      displayName: user.displayName,
    };
    void this.touchLastActiveAtIfStale(user).catch((error: unknown) => {
      const message = this.readErrorMessage(error);
      this.logger.warn(
        `Failed to record user activity for ${user.sub}: ${message}`,
      );
    });

    return true;
  }

  private async loadActiveUser(userId: string) {
    const pendingLoad = this.pendingUserLoads.get(userId);
    if (pendingLoad) {
      return pendingLoad;
    }

    const nextLoad = this.findActiveUser(userId).finally(() => {
      this.pendingUserLoads.delete(userId);
    });
    this.pendingUserLoads.set(userId, nextLoad);

    return nextLoad;
  }

  private async findActiveUser(
    userId: string,
  ): Promise<ActiveAuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        lastActiveAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User account no longer exists.');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is not active.');
    }

    return {
      sub: user.id,
      email: user.email,
      displayName: user.displayName,
      lastActiveAt: user.lastActiveAt,
    };
  }

  private async touchLastActiveAtIfStale(user: ActiveAuthenticatedUser) {
    const now = new Date();
    const staleBefore = new Date(
      now.getTime() - USER_ACTIVITY_UPDATE_THROTTLE_MS,
    );

    if (user.lastActiveAt && user.lastActiveAt >= staleBefore) {
      return;
    }

    await this.prisma.user.updateMany({
      where: {
        id: user.sub,
        status: 'ACTIVE',
        OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: staleBefore } }],
      },
      data: { lastActiveAt: now },
    });
  }

  private readErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}

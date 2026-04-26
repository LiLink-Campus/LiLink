import {
  CanActivate,
  ExecutionContext,
  Injectable,
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

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly pendingUserLoads = new Map<
    string,
    Promise<AuthenticatedUser>
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

    request.user = await this.loadActiveUser(payload.sub);

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

  private async findActiveUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
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
    };
  }
}

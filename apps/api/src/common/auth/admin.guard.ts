import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { env } from '../../config/env';
import { PrismaService } from '../prisma/prisma.service';

export interface AdminAuthenticatedRequest {
  headers: Record<string, string | undefined>;
  cookies?: Record<string, unknown>;
  admin?: {
    id: string;
    email: string;
    displayName: string | null;
  };
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<AdminAuthenticatedRequest>();

    const rawCookieToken = request.cookies?.[env.ADMIN_COOKIE_NAME];
    const cookieToken =
      typeof rawCookieToken === 'string' ? rawCookieToken : undefined;
    const authHeader =
      typeof request.headers.authorization === 'string'
        ? request.headers.authorization
        : undefined;
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : undefined;
    const token = cookieToken ?? bearerToken;

    if (!token) {
      throw new UnauthorizedException('Admin authentication is required.');
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        email: string;
      }>(token, {
        secret: env.ADMIN_JWT_SECRET,
      });

      const adminOperator = await this.prisma.adminOperator.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          displayName: true,
          isActive: true,
        },
      });

      if (!adminOperator || !adminOperator.isActive) {
        throw new UnauthorizedException('Admin session is invalid.');
      }

      request.admin = {
        id: adminOperator.id,
        email: adminOperator.email,
        displayName: adminOperator.displayName,
      };
    } catch {
      throw new UnauthorizedException('Admin session is invalid.');
    }

    return true;
  }
}

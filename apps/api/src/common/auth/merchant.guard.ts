import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { env } from '../../config/env';
import { PrismaService } from '../prisma/prisma.service';

export interface MerchantAuthenticatedRequest {
  headers: Record<string, string | undefined>;
  cookies?: Record<string, unknown>;
  merchantUser?: {
    id: string;
    merchantId: string;
    email: string;
    role: string;
    displayName: string | null;
  };
}

/**
 * Authenticates a merchant staff/owner session from the merchant cookie. The
 * token is signed with MERCHANT_JWT_SECRET (separate from user/admin secrets).
 * Both the merchant user and its merchant must be active.
 */
@Injectable()
export class MerchantGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<MerchantAuthenticatedRequest>();

    const rawCookieToken = request.cookies?.[env.MERCHANT_COOKIE_NAME];
    const token =
      typeof rawCookieToken === 'string' ? rawCookieToken : undefined;

    if (!token) {
      throw new UnauthorizedException('Merchant authentication is required.');
    }

    let payload: { sub: string };
    try {
      payload = await this.jwtService.verifyAsync<{ sub: string }>(token, {
        secret: env.MERCHANT_JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Merchant session is invalid.');
    }

    const merchantUser = await this.prisma.merchantUser.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        merchantId: true,
        email: true,
        role: true,
        displayName: true,
        isActive: true,
        merchant: { select: { isActive: true } },
      },
    });

    if (
      !merchantUser ||
      !merchantUser.isActive ||
      !merchantUser.merchant.isActive
    ) {
      throw new UnauthorizedException('Merchant session is invalid.');
    }

    request.merchantUser = {
      id: merchantUser.id,
      merchantId: merchantUser.merchantId,
      email: merchantUser.email,
      role: merchantUser.role,
      displayName: merchantUser.displayName,
    };

    return true;
  }
}

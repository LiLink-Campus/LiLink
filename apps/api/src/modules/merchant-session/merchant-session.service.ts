import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { merchantSessionConfig } from '../../common/auth/session-config';
import { env } from '../../config/env';
import { PrismaService } from '../../common/prisma/prisma.service';

// Verify Argon2 even when no usable merchant user exists so login latency does
// not reveal whether a merchant email is registered.
const MERCHANT_LOGIN_TIMING_DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$2rglnnjyD1Y/7qp5puaQPg$MhDQ8qPl+Nk7UAsGohdqSGhUccpXm4z+bSZKNnEWW5Q';

@Injectable()
export class MerchantSessionService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const merchantUser = await this.prisma.merchantUser.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        passwordHash: true,
        isActive: true,
        merchantId: true,
        merchant: { select: { isActive: true, name: true } },
      },
    });

    const usable =
      merchantUser?.isActive === true &&
      merchantUser.merchant.isActive === true;
    const hashForVerification = usable
      ? merchantUser.passwordHash
      : MERCHANT_LOGIN_TIMING_DUMMY_PASSWORD_HASH;

    const passwordMatchesStoredHash = await argon2.verify(
      hashForVerification,
      password,
    );

    if (!usable || !passwordMatchesStoredHash) {
      throw new UnauthorizedException('Merchant email or password is invalid.');
    }

    await this.prisma.merchantUser.update({
      where: { id: merchantUser.id },
      data: { lastLoginAt: new Date() },
    });

    const token = await this.jwtService.signAsync(
      {
        sub: merchantUser.id,
        email: merchantUser.email,
        jti: randomUUID(),
      },
      {
        secret: env.MERCHANT_JWT_SECRET,
        expiresIn: merchantSessionConfig.jwtExpiresIn,
      },
    );

    return {
      token,
      merchantUser: {
        id: merchantUser.id,
        email: merchantUser.email,
        displayName: merchantUser.displayName,
        role: merchantUser.role,
        merchantId: merchantUser.merchantId,
        merchantName: merchantUser.merchant.name,
      },
    };
  }

  async getMe(merchantUserId: string) {
    const merchantUser = await this.prisma.merchantUser.findUnique({
      where: { id: merchantUserId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        isActive: true,
        merchantId: true,
        merchant: { select: { isActive: true, name: true } },
      },
    });

    if (!merchantUser?.isActive || !merchantUser.merchant.isActive) {
      throw new UnauthorizedException('Merchant session is invalid.');
    }

    return {
      ok: true,
      merchantUser: {
        id: merchantUser.id,
        email: merchantUser.email,
        displayName: merchantUser.displayName,
        role: merchantUser.role,
        merchantId: merchantUser.merchantId,
        merchantName: merchantUser.merchant.name,
      },
    };
  }
}

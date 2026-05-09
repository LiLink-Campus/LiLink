import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { adminSessionConfig } from '../../common/auth/session-config';
import { env } from '../../config/env';
import { PrismaService } from '../../common/prisma/prisma.service';

// Verify Argon2 even when no operator row exists (or the operator is inactive) so
// login latency does not reveal whether an admin email is registered.
const ADMIN_LOGIN_TIMING_DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$2rglnnjyD1Y/7qp5puaQPg$MhDQ8qPl+Nk7UAsGohdqSGhUccpXm4z+bSZKNnEWW5Q';

@Injectable()
export class AdminSessionService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const adminOperator = await this.prisma.adminOperator.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        displayName: true,
        passwordHash: true,
        isActive: true,
      },
    });

    const hashForVerification =
      adminOperator?.isActive === true
        ? adminOperator.passwordHash
        : ADMIN_LOGIN_TIMING_DUMMY_PASSWORD_HASH;

    const passwordMatchesStoredHash = await argon2.verify(
      hashForVerification,
      password,
    );

    if (adminOperator?.isActive !== true || !passwordMatchesStoredHash) {
      throw new UnauthorizedException('Admin email or password is invalid.');
    }

    await this.prisma.adminOperator.update({
      where: { id: adminOperator.id },
      data: {
        lastLoginAt: new Date(),
      },
    });

    const token = await this.jwtService.signAsync(
      {
        sub: adminOperator.id,
        email: adminOperator.email,
        jti: randomUUID(),
      },
      {
        secret: env.ADMIN_JWT_SECRET,
        expiresIn: adminSessionConfig.jwtExpiresIn,
      },
    );

    return {
      token,
      admin: {
        id: adminOperator.id,
        email: adminOperator.email,
        displayName: adminOperator.displayName,
      },
    };
  }

  async getMe(adminId: string) {
    const adminOperator = await this.prisma.adminOperator.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        email: true,
        displayName: true,
        isActive: true,
      },
    });

    if (!adminOperator?.isActive) {
      throw new UnauthorizedException('Admin session is invalid.');
    }

    return {
      ok: true,
      admin: {
        id: adminOperator.id,
        email: adminOperator.email,
        displayName: adminOperator.displayName,
      },
    };
  }
}

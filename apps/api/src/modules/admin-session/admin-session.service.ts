import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import { PrismaService } from '../../common/prisma/prisma.service';

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

    if (!adminOperator?.isActive) {
      throw new UnauthorizedException('Admin email or password is invalid.');
    }

    const isValidPassword = await argon2.verify(
      adminOperator.passwordHash,
      password,
    );

    if (!isValidPassword) {
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
        expiresIn: '12h',
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

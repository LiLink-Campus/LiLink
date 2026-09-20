import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';

export const VIP_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export function hashVipCode(input: string) {
  const code = input.trim().replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z0-9]{24}$/.test(code)) {
    throw new BadRequestException('请输入完整的 24 位 VIP 激活码。');
  }
  return createHash('sha256').update(code).digest('hex');
}

@Injectable()
export class VipService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(userId: string) {
    const grant = await this.prisma.vipActivation.findFirst({
      where: { userId, revokedAt: null },
      orderBy: { expiresAt: 'desc' },
      select: { activatedAt: true, expiresAt: true },
    });
    return {
      active: Boolean(
        grant?.expiresAt && grant.expiresAt.getTime() > Date.now(),
      ),
      activatedAt: grant?.activatedAt ?? null,
      expiresAt: grant?.expiresAt ?? null,
      durationDays: 30,
      priceYuan: '29.90',
      advancedFiltersAvailable: true,
    };
  }

  async activate(userId: string, input: string) {
    const codeHash = hashVipCode(input);
    await this.prisma.$transaction(async (tx) => {
      // Serialize activation for this account, including different codes.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { status: true, deactivatedAt: true },
      });
      if (!user || user.status !== 'ACTIVE' || user.deactivatedAt) {
        throw new UnauthorizedException('账号不可用，请重新登录。');
      }
      const code = await tx.vipActivation.findUnique({ where: { codeHash } });
      if (!code || code.revokedAt)
        throw new BadRequestException(
          '激活码无效或已停用，请核对订单或联系客服。',
        );
      if (code.userId === userId) return;
      if (code.userId)
        throw new ConflictException('此激活码已被使用，请勿重复兑换。');
      const now = new Date();
      const current = await tx.vipActivation.findFirst({
        where: { userId, revokedAt: null, expiresAt: { gt: now } },
        orderBy: { expiresAt: 'desc' },
      });
      const startsAt = current?.expiresAt ?? now;
      const claimed = await tx.vipActivation.updateMany({
        where: { id: code.id, userId: null, revokedAt: null },
        data: {
          userId,
          activatedAt: now,
          expiresAt: new Date(startsAt.getTime() + VIP_DURATION_MS),
        },
      });
      if (claimed.count !== 1)
        throw new ConflictException('此激活码已被使用或停用，请核对订单。');
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: 'VIP_ACTIVATED',
          metadata: { activationId: code.id, durationDays: 30 },
        },
      });
    });
    return this.getStatus(userId);
  }
}

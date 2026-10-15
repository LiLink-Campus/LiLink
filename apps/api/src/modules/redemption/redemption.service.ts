import { Injectable } from '@nestjs/common';
import { RedemptionResult, verifyTotpToken } from '@lilink/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface RedeemCouponView {
  title: string;
  benefitText: string;
  userDisplayName: string | null;
}
export interface RedeemResponse {
  result: RedemptionResult;
  coupon: RedeemCouponView | null;
}
class CouponUnavailable extends Error {}

@Injectable()
export class RedemptionService {
  constructor(private readonly prisma: PrismaService) {}

  async redeem(
    code: string,
    totp: string,
    merchantId: string,
    merchantUserId: string,
  ): Promise<RedeemResponse> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const candidate = await tx.coupon.findFirst({
          where: {
            code: code.trim().toUpperCase(),
            template: { merchantId },
            user: { status: 'ACTIVE', deactivatedAt: null },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          include: { template: true, user: { select: { displayName: true } } },
        });
        if (!candidate) return this.bare('INVALID');
        if (candidate.status === 'REDEEMED') return this.bare('ALREADY_USED');
        if (
          candidate.status === 'VOID' &&
          candidate.voidReason === 'GROUP_USED'
        )
          return this.bare('GROUP_USED');
        if (candidate.status !== 'ISSUED') return this.bare('INVALID');
        if (
          !candidate.totpSecret ||
          !verifyTotpToken(candidate.totpSecret, totp)
        )
          return this.bare('EXPIRED_CODE');

        const groupId = candidate.template.redemptionGroupId;
        if (groupId) {
          // The unique claim serializes all coupons of one holder/group. A loser
          // cannot consume a different member, even before sibling states refresh.
          const claims = await tx.$queryRaw<{ couponId: string }[]>`
            INSERT INTO "CouponGroupRedemption" ("userId", "groupId", "couponId")
            VALUES (${candidate.userId}, ${groupId}, ${candidate.id})
            ON CONFLICT ("userId", "groupId") DO NOTHING RETURNING "couponId"
          `;
          if (!claims.length) {
            const prior = await tx.couponGroupRedemption.findUniqueOrThrow({
              where: { userId_groupId: { userId: candidate.userId, groupId } },
            });
            return this.bare(
              prior.couponId === candidate.id ? 'ALREADY_USED' : 'GROUP_USED',
            );
          }
        }
        const updated = await tx.coupon.updateMany({
          where: {
            id: candidate.id,
            status: 'ISSUED',
            user: { status: 'ACTIVE', deactivatedAt: null },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          data: { status: 'REDEEMED' },
        });
        if (updated.count !== 1) {
          if (groupId) throw new CouponUnavailable();
          return this.bare('ALREADY_USED');
        }
        await tx.redemption.create({
          data: {
            couponId: candidate.id,
            merchantId,
            merchantUserId,
            userId: candidate.userId,
          },
        });
        if (groupId)
          await tx.coupon.updateMany({
            where: {
              userId: candidate.userId,
              id: { not: candidate.id },
              status: 'ISSUED',
              template: { redemptionGroupId: groupId },
            },
            data: { status: 'VOID', voidReason: 'GROUP_USED' },
          });
        await tx.auditLog.create({
          data: {
            action: 'coupon.redeemed',
            metadata: {
              couponId: candidate.id,
              merchantId,
              merchantUserId,
              redemptionGroupId: groupId,
            },
          },
        });
        return {
          result: 'SUCCESS',
          coupon: {
            title: candidate.template.title,
            benefitText: candidate.template.benefitText,
            userDisplayName: candidate.user.displayName,
          },
        };
      });
    } catch (error) {
      if (error instanceof CouponUnavailable) return this.bare('INVALID');
      throw error;
    }
  }

  private bare(result: RedemptionResult): RedeemResponse {
    return { result, coupon: null };
  }
}

import { Injectable } from '@nestjs/common';
import {
  CouponBenefitType,
  CouponRule,
  MerchantPromotionBlock,
  RedemptionResult,
  renderBenefitText,
} from '@lilink/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface RedeemResponse {
  result: RedemptionResult;
  coupon: {
    title: string;
    benefitText: string;
    faceValue: number;
    userDisplayName: string | null;
  } | null;
  merchantPromotion: MerchantPromotionBlock[] | null;
}

@Injectable()
export class RedemptionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Redeem a coupon for the logged-in merchant. SQL-level three states:
   * - SUCCESS: a single conditional update flipped ISSUED -> REDEEMED (the
   *   coupon belongs to this merchant, is unexpired, and the holder is ACTIVE),
   *   then a Redemption row + audit are written and the merchant promotion is
   *   returned.
   * - ALREADY_USED: only when a REDEEMED coupon for THIS merchant held by an
   *   ACTIVE user exists.
   * - INVALID: everything else (wrong merchant / not found / expired / holder
   *   not ACTIVE) — never reveals whether the code exists.
   *
   * ⏸️ §B: when a coupon rule carries amount conditions/discounts, evaluate it
   * here against a merchant-entered orderAmount before flipping status, and
   * persist orderAmount/actualDiscountAmount. MVP does not evaluate amounts.
   */
  async redeem(
    code: string,
    merchantId: string,
    merchantUserId: string,
  ): Promise<RedeemResponse> {
    const normalizedCode = code.trim().toUpperCase();
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.coupon.updateMany({
        where: {
          code: normalizedCode,
          status: 'ISSUED',
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          template: { is: { merchantId } },
          user: { is: { status: 'ACTIVE' } },
        },
        data: { status: 'REDEEMED' },
      });

      if (updated.count === 1) {
        // Re-read the just-updated coupon with template/user snapshots (the
        // conditional updateMany only returns a count).
        const coupon = await tx.coupon.findUnique({
          where: { code: normalizedCode },
          select: {
            id: true,
            userId: true,
            template: {
              select: {
                title: true,
                benefitType: true,
                faceValue: true,
                rule: true,
              },
            },
            user: { select: { displayName: true } },
          },
        });

        if (coupon) {
          await tx.redemption.create({
            data: {
              couponId: coupon.id,
              merchantId,
              merchantUserId,
              userId: coupon.userId,
              faceValueSnapshot: coupon.template.faceValue,
            },
          });
          await tx.auditLog.create({
            data: {
              adminActorId: null,
              action: 'coupon.redeemed',
              metadata: { couponId: coupon.id, merchantId, merchantUserId },
            },
          });

          const merchant = await tx.merchant.findUnique({
            where: { id: merchantId },
            select: { promotionBlocks: true },
          });

          return {
            result: 'SUCCESS',
            coupon: {
              title: coupon.template.title,
              benefitText: renderBenefitText({
                benefitType: coupon.template.benefitType as CouponBenefitType,
                title: coupon.template.title,
                faceValue: coupon.template.faceValue,
                rule: coupon.template.rule as CouponRule | null,
              }),
              faceValue: coupon.template.faceValue,
              userDisplayName: coupon.user.displayName,
            },
            merchantPromotion: (merchant?.promotionBlocks ??
              []) as unknown as MerchantPromotionBlock[],
          };
        }
      }

      // count === 0: ALREADY_USED only for a REDEEMED coupon of this merchant
      // held by an ACTIVE user; anything else is INVALID (no existence leak).
      const alreadyUsed = await tx.coupon.count({
        where: {
          code: normalizedCode,
          status: 'REDEEMED',
          template: { is: { merchantId } },
          user: { is: { status: 'ACTIVE' } },
        },
      });

      return {
        result: alreadyUsed > 0 ? 'ALREADY_USED' : 'INVALID',
        coupon: null,
        merchantPromotion: null,
      };
    });
  }
}

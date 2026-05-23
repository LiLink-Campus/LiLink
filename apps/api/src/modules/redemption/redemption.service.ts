import { Injectable } from '@nestjs/common';
import {
  CouponRule,
  MerchantPromotionBlock,
  RedemptionResult,
  evaluateCoupon,
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
  // The benefit resolved at redemption (SUCCESS only): how much cash to take
  // off and/or which gift to hand over, plus the merchant-entered amount.
  applied: {
    orderAmount: number | null;
    discountAmount: number;
    gift: string | null;
  } | null;
  merchantPromotion: MerchantPromotionBlock[] | null;
}

@Injectable()
export class RedemptionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Redeem a coupon for the logged-in merchant. Five states:
   * - SUCCESS: the coupon belongs to this merchant, is unexpired, the holder is
   *   ACTIVE, its rule evaluates ok for `orderAmount`, and a single conditional
   *   update flipped ISSUED -> REDEEMED. Writes a Redemption (with orderAmount /
   *   actualDiscountAmount) + audit and returns the resolved benefit + promotion.
   * - NEED_AMOUNT / BELOW_THRESHOLD (§B): the code matches a valid coupon of this
   *   merchant but its tiered rule needs an amount that is missing, or the amount
   *   meets no tier. The coupon is NOT consumed; the tier ladder is returned so
   *   staff can act. These only arise after the gate matches, so no existence leak.
   * - ALREADY_USED: only when a REDEEMED coupon for THIS merchant held by an
   *   ACTIVE user exists (or a concurrent redeemer won the flip).
   * - INVALID: everything else (wrong merchant / not found / expired / holder
   *   not ACTIVE) — never reveals whether the code exists.
   *
   * The merchant-entered `orderAmount` is not anti-fraud (it can be falsified);
   * it drives tier selection + reconciliation. Fraud signals are a separate line.
   */
  async redeem(
    code: string,
    merchantId: string,
    merchantUserId: string,
    orderAmount?: number,
  ): Promise<RedeemResponse> {
    const normalizedCode = code.trim().toUpperCase();
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      // 1. Read the candidate scoped to the redeemable gate.
      const candidate = await tx.coupon.findFirst({
        where: {
          code: normalizedCode,
          status: 'ISSUED',
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          template: { is: { merchantId } },
          user: { is: { status: 'ACTIVE' } },
        },
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

      if (!candidate) {
        // No redeemable match: ALREADY_USED only for a REDEEMED, still-unexpired
        // coupon of this merchant held by an ACTIVE user. Expired coupons (even
        // if REDEEMED) stay INVALID — same expiry gate as the redeemable query —
        // so we never leak that an expired code belonged to this merchant.
        const alreadyUsed = await tx.coupon.count({
          where: {
            code: normalizedCode,
            status: 'REDEEMED',
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            template: { is: { merchantId } },
            user: { is: { status: 'ACTIVE' } },
          },
        });
        return this.bare(alreadyUsed > 0 ? 'ALREADY_USED' : 'INVALID');
      }

      const rule = candidate.template.rule as CouponRule | null;
      const couponView = {
        title: candidate.template.title,
        benefitText: renderBenefitText({
          benefitType: candidate.template.benefitType,
          title: candidate.template.title,
          faceValue: candidate.template.faceValue,
          rule,
        }),
        faceValue: candidate.template.faceValue,
        userDisplayName: candidate.user.displayName,
      };

      // 2. §B: evaluate the rule before consuming. NEED_AMOUNT / BELOW_THRESHOLD
      //    leave the coupon untouched; the ladder is returned for staff.
      const evaluation = evaluateCoupon(rule, { orderAmount, now });
      if (!evaluation.ok) {
        return {
          result: evaluation.reason,
          coupon: couponView,
          applied: null,
          merchantPromotion: null,
        };
      }

      // 3. CAS flip ISSUED -> REDEEMED (same gate). A racing redeemer leaves
      //    count 0 -> ALREADY_USED; Redemption.couponId @unique is the backstop.
      const updated = await tx.coupon.updateMany({
        where: {
          id: candidate.id,
          status: 'ISSUED',
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          template: { is: { merchantId } },
          user: { is: { status: 'ACTIVE' } },
        },
        data: { status: 'REDEEMED' },
      });
      if (updated.count !== 1) {
        return this.bare('ALREADY_USED');
      }

      const discountAmount =
        evaluation.discount > 0 ? evaluation.discount : null;
      await tx.redemption.create({
        data: {
          couponId: candidate.id,
          merchantId,
          merchantUserId,
          userId: candidate.userId,
          faceValueSnapshot: candidate.template.faceValue,
          orderAmount: orderAmount ?? null,
          actualDiscountAmount: discountAmount,
        },
      });
      // Gift identity is recorded in the append-only audit log (no extra column).
      await tx.auditLog.create({
        data: {
          adminActorId: null,
          action: 'coupon.redeemed',
          metadata: {
            couponId: candidate.id,
            merchantId,
            merchantUserId,
            orderAmount: orderAmount ?? null,
            discountAmount,
            gift: evaluation.gift,
          },
        },
      });

      const merchant = await tx.merchant.findUnique({
        where: { id: merchantId },
        select: { promotionBlocks: true },
      });

      return {
        result: 'SUCCESS',
        coupon: couponView,
        applied: {
          orderAmount: orderAmount ?? null,
          discountAmount: evaluation.discount,
          gift: evaluation.gift,
        },
        merchantPromotion: (merchant?.promotionBlocks ??
          []) as unknown as MerchantPromotionBlock[],
      };
    });
  }

  private bare(result: RedemptionResult): RedeemResponse {
    return { result, coupon: null, applied: null, merchantPromotion: null };
  }
}

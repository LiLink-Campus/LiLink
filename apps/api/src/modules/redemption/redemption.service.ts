import { Injectable } from '@nestjs/common';
import {
  CouponBenefitType,
  CouponRule,
  MerchantPromotionBlock,
  RedemptionResult,
  evaluateCoupon,
  renderBenefitText,
  requiresOrderAmount,
  verifyTotpToken,
} from '@lilink/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedeemTicketService } from './redeem-ticket.service';

export interface RedeemCouponView {
  title: string;
  benefitText: string;
  faceValue: number;
  userDisplayName: string | null;
}

/** Outcome of the freshness check before a redemption is confirmed. */
export type PrepareRedeemResult =
  | 'OK'
  | 'INVALID'
  | 'ALREADY_USED'
  | 'EXPIRED_CODE';

export interface PrepareRedeemResponse {
  result: PrepareRedeemResult;
  // SUCCESS-only fields. `redeemTicket` is a short-lived JWT the merchant
  // replays to POST /merchant/redeem; `needAmount` tells the UI to collect an
  // order amount for amount-dependent (tiered) coupons.
  coupon?: RedeemCouponView;
  needAmount?: boolean;
  redeemTicket?: string;
}

export interface RedeemResponse {
  result: RedemptionResult;
  coupon: RedeemCouponView | null;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketService: RedeemTicketService,
  ) {}

  /**
   * Step 1 of the two-step flow. Verifies that the scanned short code maps to a
   * live coupon of this merchant and that the holder's rotating TOTP token is
   * fresh, then issues a short-lived redeem ticket. This is READ-ONLY: it never
   * flips coupon status, so a probe cannot consume a coupon.
   *
   * Outcomes:
   * - OK: coupon is ISSUED, unexpired, holder ACTIVE, and the TOTP matches the
   *   ±1 window — returns the coupon view, whether an order amount is required,
   *   and a 3-min ticket bound to {couponId, merchantId}.
   * - ALREADY_USED: the coupon is REDEEMED (checked before the TOTP so a used
   *   coupon is reported plainly rather than masked as a code-freshness error).
   * - EXPIRED_CODE: the coupon has no rotating secret or the TOTP is stale/wrong.
   * - INVALID: no coupon for this merchant matches (wrong code / different
   *   merchant / inactive holder / expired) — never reveals whether it exists.
   */
  async prepare(params: {
    merchantId: string;
    code: string;
    totp: string;
  }): Promise<PrepareRedeemResponse> {
    const { merchantId, totp } = params;
    const normalizedCode = params.code.trim().toUpperCase();
    const now = new Date();

    // Locate the coupon scoped to this merchant + ACTIVE holder + unexpired,
    // regardless of ISSUED/REDEEMED — status drives the outcome below. An
    // expired coupon does not match, so it falls through to INVALID and never
    // leaks that the code belonged to this merchant.
    const coupon = await this.prisma.coupon.findFirst({
      where: {
        code: normalizedCode,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        template: { is: { merchantId } },
        user: { is: { status: 'ACTIVE' } },
      },
      select: {
        id: true,
        status: true,
        totpSecret: true,
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

    if (!coupon) {
      return { result: 'INVALID' };
    }
    if (coupon.status === 'REDEEMED') {
      return { result: 'ALREADY_USED' };
    }
    if (!coupon.totpSecret || !verifyTotpToken(coupon.totpSecret, totp)) {
      return { result: 'EXPIRED_CODE' };
    }

    const rule = coupon.template.rule as CouponRule | null;
    return {
      result: 'OK',
      coupon: this.couponView(coupon.template, coupon.user),
      needAmount: requiresOrderAmount(rule),
      redeemTicket: this.ticketService.sign({
        couponId: coupon.id,
        merchantId,
      }),
    };
  }

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
      const couponView = this.couponView(candidate.template, candidate.user);

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

  /** Render the holder-facing coupon view shared by prepare + redeem. */
  private couponView(
    template: {
      title: string;
      benefitType: CouponBenefitType;
      faceValue: number;
      rule: unknown;
    },
    user: { displayName: string | null },
  ): RedeemCouponView {
    return {
      title: template.title,
      benefitText: renderBenefitText({
        benefitType: template.benefitType,
        title: template.title,
        faceValue: template.faceValue,
        rule: template.rule as CouponRule | null,
      }),
      faceValue: template.faceValue,
      userDisplayName: user.displayName,
    };
  }

  private bare(result: RedemptionResult): RedeemResponse {
    return { result, coupon: null, applied: null, merchantPromotion: null };
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import {
  COUPON_TOTP,
  CouponStatus,
  MerchantPromotionBlock,
  effectiveCouponStatus,
  validateMerchantPromotionBlocks,
} from '@lilink/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Shape returned by GET /me/coupons/:id/redeem-secret */
export interface RedeemSecretResponse {
  code: string;
  secret: string;
  period: number;
  digits: number;
}

/** Shape returned by GET /me/coupons/:id/status */
export interface CouponStatusResponse {
  status: CouponStatus;
  redeemedAt?: string;
  applied?: {
    orderAmount: number | null;
    discountAmount: number;
    gift: string | null;
  };
  merchantPromotion?: MerchantPromotionBlock[];
}

@Injectable()
export class CouponUserService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the TOTP secret and parameters needed for the user's device to
   * display a rolling 6-digit code. Only valid for an ISSUED, non-expired
   * coupon that already has a secret set (totpSecret != null).
   * Returns 404 for any other state to avoid leaking existence.
   */
  async getRedeemSecret(
    userId: string,
    couponId: string,
  ): Promise<RedeemSecretResponse> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id: couponId, userId },
      select: {
        code: true,
        status: true,
        expiresAt: true,
        totpSecret: true,
      },
    });

    if (!coupon) throw new NotFoundException();

    const effective = effectiveCouponStatus(
      { status: coupon.status, expiresAt: coupon.expiresAt },
      new Date(),
    );

    if (effective !== 'ISSUED' || !coupon.totpSecret) {
      throw new NotFoundException();
    }

    return {
      code: coupon.code,
      secret: coupon.totpSecret,
      period: COUPON_TOTP.period,
      digits: COUPON_TOTP.digits,
    };
  }

  /**
   * Lightweight poll endpoint: returns the effective coupon status plus
   * redemption details (applied discount, gift, merchant promotion blocks)
   * when the coupon has been REDEEMED. Returns 404 if the coupon does not
   * belong to the caller.
   */
  async getCouponStatus(
    userId: string,
    couponId: string,
  ): Promise<CouponStatusResponse> {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id: couponId, userId },
      select: {
        status: true,
        expiresAt: true,
        redemption: {
          select: {
            orderAmount: true,
            actualDiscountAmount: true,
            giftLabel: true,
            redeemedAt: true,
            merchant: {
              select: { promotionBlocks: true },
            },
          },
        },
      },
    });

    if (!coupon) throw new NotFoundException();

    const effective = effectiveCouponStatus(
      { status: coupon.status, expiresAt: coupon.expiresAt },
      new Date(),
    );

    if (effective !== 'REDEEMED') {
      return { status: effective };
    }

    const r = coupon.redemption!;
    const blocks = validateMerchantPromotionBlocks(
      r.merchant?.promotionBlocks ?? null,
    );

    return {
      status: 'REDEEMED',
      redeemedAt: r.redeemedAt.toISOString(),
      applied: {
        orderAmount: r.orderAmount ?? null,
        discountAmount: r.actualDiscountAmount ?? 0,
        gift: r.giftLabel ?? null,
      },
      merchantPromotion: blocks,
    };
  }
}

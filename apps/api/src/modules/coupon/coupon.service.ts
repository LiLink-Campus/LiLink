import { Injectable } from '@nestjs/common';
import {
  CouponRule,
  effectiveCouponStatus,
  renderBenefitText,
} from '@lilink/shared';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class CouponService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The signed-in user's coupons with the redemption code visible (coupons are
   * granted directly as ISSUED). Status is the effective status: an ISSUED
   * coupon past its expiry is reported as EXPIRED so the page can partition
   * stably without a cron job. The ACTIVE-user gate is enforced server-side at
   * redemption, not represented here.
   */
  async getMyCoupons(userId: string) {
    const coupons = await this.prisma.coupon.findMany({
      where: { userId },
      orderBy: { issuedAt: 'desc' },
      include: {
        template: {
          select: {
            title: true,
            benefitType: true,
            faceValue: true,
            rule: true,
            merchant: { select: { name: true } },
          },
        },
        redemption: { select: { redeemedAt: true } },
      },
    });

    const now = new Date();
    // Flat shape per the contract's MyCouponResponseDto (dates as ISO strings).
    return {
      items: coupons.map((coupon) => ({
        id: coupon.id,
        status: effectiveCouponStatus(
          {
            status: coupon.status,
            expiresAt: coupon.expiresAt,
          },
          now,
        ),
        code: coupon.code,
        merchantName: coupon.template.merchant.name,
        title: coupon.template.title,
        benefitType: coupon.template.benefitType,
        benefitText: renderBenefitText({
          benefitType: coupon.template.benefitType,
          title: coupon.template.title,
          faceValue: coupon.template.faceValue,
          rule: coupon.template.rule as CouponRule | null,
        }),
        faceValue: coupon.template.faceValue,
        issuedAt: coupon.issuedAt.toISOString(),
        expiresAt: coupon.expiresAt ? coupon.expiresAt.toISOString() : null,
        redeemedAt: coupon.redemption?.redeemedAt
          ? coupon.redemption.redeemedAt.toISOString()
          : null,
      })),
    };
  }
}

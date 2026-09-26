import { ActivationService } from '../activation/activation.service';
import { Injectable, Optional } from '@nestjs/common';
import { couponDetails, couponView, readCouponPage } from './coupon-reader';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  getDashboardCouponAgenda,
  markDashboardCouponAgendaRead,
} from './coupon-read-state';

@Injectable()
export class CouponService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly activation?: ActivationService,
  ) {}

  /**
   * The signed-in user's coupons with the redemption code visible (coupons are
   * granted directly as ISSUED). Status is the effective status: an ISSUED
   * coupon past its expiry is reported as EXPIRED so the page can partition
   * stably without a cron job. The ACTIVE-user gate is enforced server-side at
   * redemption, not represented here.
   */
  async getMyCoupons(userId: string) {
    await this.activation?.tryGrantCoupons(userId);
    const coupons = await this.prisma.coupon.findMany({
      where: { userId },
      orderBy: { issuedAt: 'desc' },
      include: couponDetails,
    });

    const now = new Date();
    // Flat shape per the contract's MyCouponResponseDto (dates as ISO strings).
    return {
      items: coupons.map((coupon) => couponView(coupon, now)),
    };
  }

  async getMyCouponOverview(userId: string) {
    // Keep first-visit compensation; subsequent pages are strictly read-only.
    await this.activation?.tryGrantCoupons(userId);
    const now = new Date();
    const [available, history] = await Promise.all([
      readCouponPage(this.prisma, userId, 'available', undefined, now),
      readCouponPage(this.prisma, userId, 'history', undefined, now),
    ]);
    return { available, history };
  }

  getMyCouponPage(userId: string, status: unknown, cursor?: unknown) {
    return readCouponPage(this.prisma, userId, status, cursor);
  }

  getMyCouponReadState(userId: string) {
    return getDashboardCouponAgenda(this.prisma, userId);
  }

  markMyCouponRead(userId: string) {
    return markDashboardCouponAgendaRead(this.prisma, userId);
  }
}

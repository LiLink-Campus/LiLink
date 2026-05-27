import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../../common/auth/jwt-auth.guard';
import { CouponService } from './coupon.service';
import { CouponUserService } from './coupon-user.service';

@Controller('me/coupons')
@UseGuards(JwtAuthGuard)
export class CouponController {
  constructor(
    private readonly couponService: CouponService,
    private readonly couponUserService: CouponUserService,
  ) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.couponService.getMyCoupons(request.user!.sub);
  }

  @Get('read-state')
  getReadState(@Req() request: AuthenticatedRequest) {
    return this.couponService.getMyCouponReadState(request.user!.sub);
  }

  @Post('read-state')
  markRead(@Req() request: AuthenticatedRequest) {
    return this.couponService.markMyCouponRead(request.user!.sub);
  }

  /** Returns the TOTP secret for rendering a rolling code on the user's device. */
  @Get(':id/redeem-secret')
  getRedeemSecret(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.couponUserService.getRedeemSecret(request.user!.sub, id);
  }

  /** Polls the effective coupon status; includes redemption details when REDEEMED. */
  @Get(':id/status')
  getCouponStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.couponUserService.getCouponStatus(request.user!.sub, id);
  }
}

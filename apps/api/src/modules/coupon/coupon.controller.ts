import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../../common/auth/jwt-auth.guard';
import { CouponService } from './coupon.service';

@Controller('me/coupons')
@UseGuards(JwtAuthGuard)
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.couponService.getMyCoupons(request.user!.sub);
  }
}

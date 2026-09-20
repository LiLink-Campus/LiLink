import { ActivationModule } from '../activation/activation.module';
import { Module } from '@nestjs/common';
import { CouponController } from './coupon.controller';
import { CouponService } from './coupon.service';
import { CouponUserService } from './coupon-user.service';

@Module({
  imports: [ActivationModule],
  controllers: [CouponController],
  providers: [CouponService, CouponUserService],
  exports: [CouponService, CouponUserService],
})
export class CouponModule {}

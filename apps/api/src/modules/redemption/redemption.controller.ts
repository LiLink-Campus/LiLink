import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MerchantGuard } from '../../common/auth/merchant.guard';
import type { MerchantAuthenticatedRequest } from '../../common/auth/merchant.guard';
import { PrepareRedeemDto, RedeemCouponDto } from './dto';
import { RedemptionService } from './redemption.service';

// `code` is public (printed on the coupon), so both redemption routes are a
// brute-force surface. Override the loose global default with a tight per-route
// cap (the `default` key targets the global throttler bucket).
const REDEEM_THROTTLE = { default: { limit: 30, ttl: 60_000 } } as const;

@Controller('merchant')
@UseGuards(MerchantGuard)
export class RedemptionController {
  constructor(private readonly redemptionService: RedemptionService) {}

  @Post('redeem/prepare')
  @Throttle(REDEEM_THROTTLE)
  prepare(
    @Req() request: MerchantAuthenticatedRequest,
    @Body() body: PrepareRedeemDto,
  ) {
    return this.redemptionService.prepare({
      merchantId: request.merchantUser!.merchantId,
      code: body.code,
      totp: body.totp,
    });
  }

  @Post('redeem')
  @Throttle(REDEEM_THROTTLE)
  redeem(
    @Req() request: MerchantAuthenticatedRequest,
    @Body() body: RedeemCouponDto,
  ) {
    return this.redemptionService.redeem(
      body.redeemTicket,
      request.merchantUser!.merchantId,
      request.merchantUser!.id,
      body.orderAmount,
    );
  }
}

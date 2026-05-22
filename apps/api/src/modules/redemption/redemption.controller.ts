import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { MerchantGuard } from '../../common/auth/merchant.guard';
import type { MerchantAuthenticatedRequest } from '../../common/auth/merchant.guard';
import { RedeemCouponDto } from './dto';
import { RedemptionService } from './redemption.service';

@Controller('merchant')
@UseGuards(MerchantGuard)
export class RedemptionController {
  constructor(private readonly redemptionService: RedemptionService) {}

  @Post('redeem')
  redeem(
    @Req() request: MerchantAuthenticatedRequest,
    @Body() body: RedeemCouponDto,
  ) {
    return this.redemptionService.redeem(
      body.code,
      request.merchantUser!.merchantId,
      request.merchantUser!.id,
    );
  }
}

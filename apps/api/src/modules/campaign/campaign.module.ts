import { Module } from '@nestjs/common';
import { CampaignAdminController } from './campaign.controller';
import { CampaignService } from './campaign.service';
import { CouponTemplateService } from './coupon-template.service';

@Module({
  controllers: [CampaignAdminController],
  providers: [CampaignService, CouponTemplateService],
  exports: [CampaignService],
})
export class CampaignModule {}

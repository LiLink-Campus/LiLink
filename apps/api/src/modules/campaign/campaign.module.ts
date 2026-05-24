import { Module } from '@nestjs/common';
import { CampaignAdminController } from './campaign.controller';
import { CampaignService } from './campaign.service';

@Module({
  controllers: [CampaignAdminController],
  providers: [CampaignService],
  exports: [CampaignService],
})
export class CampaignModule {}

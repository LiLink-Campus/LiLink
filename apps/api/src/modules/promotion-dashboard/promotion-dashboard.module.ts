import { Module } from '@nestjs/common';
import { PromotionDashboardController } from './promotion-dashboard.controller';
import { PromotionDashboardService } from './promotion-dashboard.service';

@Module({
  controllers: [PromotionDashboardController],
  providers: [PromotionDashboardService],
})
export class PromotionDashboardModule {}

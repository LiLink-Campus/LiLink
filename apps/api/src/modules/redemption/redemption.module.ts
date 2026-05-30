import { Module } from '@nestjs/common';
import { ProductAnalyticsModule } from '../product-analytics/product-analytics.module';
import { RedemptionController } from './redemption.controller';
import { RedemptionService } from './redemption.service';
import { RedeemTicketService } from './redeem-ticket.service';

@Module({
  imports: [ProductAnalyticsModule],
  controllers: [RedemptionController],
  providers: [RedemptionService, RedeemTicketService],
  exports: [RedemptionService, RedeemTicketService],
})
export class RedemptionModule {}

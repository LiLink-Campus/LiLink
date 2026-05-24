import { Module } from '@nestjs/common';
import { RedemptionController } from './redemption.controller';
import { RedemptionService } from './redemption.service';
import { RedeemTicketService } from './redeem-ticket.service';

@Module({
  controllers: [RedemptionController],
  providers: [RedemptionService, RedeemTicketService],
  exports: [RedemptionService, RedeemTicketService],
})
export class RedemptionModule {}

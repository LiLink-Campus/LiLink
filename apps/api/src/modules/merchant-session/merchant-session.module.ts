import { Module } from '@nestjs/common';
import { MerchantSessionController } from './merchant-session.controller';
import { MerchantSessionService } from './merchant-session.service';

@Module({
  controllers: [MerchantSessionController],
  providers: [MerchantSessionService],
})
export class MerchantSessionModule {}

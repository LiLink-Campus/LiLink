import { Module } from '@nestjs/common';
import { MerchantAdminController } from './merchant.controller';
import { MerchantService } from './merchant.service';

@Module({
  controllers: [MerchantAdminController],
  providers: [MerchantService],
  exports: [MerchantService],
})
export class MerchantModule {}

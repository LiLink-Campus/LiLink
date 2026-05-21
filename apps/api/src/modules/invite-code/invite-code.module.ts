import { Module } from '@nestjs/common';
import { InviteCodeAdminController } from './invite-code.controller';
import { InviteCodeService } from './invite-code.service';

@Module({
  controllers: [InviteCodeAdminController],
  providers: [InviteCodeService],
  exports: [InviteCodeService],
})
export class InviteCodeModule {}

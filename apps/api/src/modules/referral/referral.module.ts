import { Module } from '@nestjs/common';
import { ReferralService } from './referral.service';

// Controllers (landing click / share events / GET /me/referral) are added in a
// later M1 step. This module currently exposes ReferralService for AuthService
// (registration attribution + personal-code assignment).
@Module({
  providers: [ReferralService],
  exports: [ReferralService],
})
export class ReferralModule {}

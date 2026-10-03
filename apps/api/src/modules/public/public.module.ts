import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { CommunityStatsService } from './community-stats.service';
import { PublicService } from './public.service';
import { PublicCacheInvalidationService } from './public-cache-invalidation.service';
import { PublicCacheClaimController } from './public-cache-claim.controller';

@Module({
  controllers: [PublicController, PublicCacheClaimController],
  providers: [
    PublicService,
    CommunityStatsService,
    PublicCacheInvalidationService,
  ],
  exports: [PublicService, CommunityStatsService],
})
export class PublicModule {}

import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { CommunityStatsService } from './community-stats.service';
import { PublicService } from './public.service';
import { PublicCacheInvalidationService } from './public-cache-invalidation.service';
import { PublicCacheClaimController } from './public-cache-claim.controller';
import { PublicCachePublicationService } from './public-cache-publication.service';
import { PublicCachePublicationController } from './public-cache-publication.controller';

@Module({
  controllers: [
    PublicController,
    PublicCacheClaimController,
    PublicCachePublicationController,
  ],
  providers: [
    PublicService,
    CommunityStatsService,
    PublicCacheInvalidationService,
    PublicCachePublicationService,
  ],
  exports: [PublicService, CommunityStatsService],
})
export class PublicModule {}

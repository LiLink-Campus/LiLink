import { PublicCacheSignals } from './public-cache-signals';
import {
  createPublicCacheDatabase,
  PUBLIC_CACHE_DATABASE,
} from './public-cache-database';
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
    { provide: PUBLIC_CACHE_DATABASE, useFactory: createPublicCacheDatabase },
    PublicCacheSignals,
    PublicService,
    CommunityStatsService,
    PublicCacheInvalidationService,
    PublicCachePublicationService,
  ],
  exports: [PublicService, CommunityStatsService],
})
export class PublicModule {}

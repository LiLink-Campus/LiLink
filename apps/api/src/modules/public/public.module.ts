import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { CommunityStatsService } from './community-stats.service';
import { PublicService } from './public.service';

@Module({
  controllers: [PublicController],
  providers: [PublicService, CommunityStatsService],
  exports: [PublicService, CommunityStatsService],
})
export class PublicModule {}

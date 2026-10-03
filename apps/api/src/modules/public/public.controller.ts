import {
  Controller,
  Get,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { PUBLIC_READ_THROTTLE } from '../../common/http/public-read-throttle';
import { CommunityStatsService } from './community-stats.service';
import { PublicService } from './public.service';

@Controller('public')
export class PublicController {
  constructor(
    private readonly publicService: PublicService,
    private readonly communityStats: CommunityStatsService,
  ) {}

  @Get('home')
  @Throttle(PUBLIC_READ_THROTTLE)
  async getHome(@Res({ passthrough: true }) response: Response) {
    try {
      const [landing, community] = await Promise.all([
        this.publicService.getLandingPayload(),
        this.communityStats.getStats(),
      ]);
      response.setHeader('Cache-Control', 'public, max-age=60');
      return { landing, community };
    } catch {
      response.setHeader('Cache-Control', 'no-store');
      throw new ServiceUnavailableException(
        'Public home data is temporarily unavailable.',
      );
    }
  }

  @Get('community')
  @Throttle(PUBLIC_READ_THROTTLE)
  getCommunity() {
    return this.communityStats.getStats();
  }

  @Get('landing')
  @Throttle(PUBLIC_READ_THROTTLE)
  getLanding() {
    return this.publicService.getLandingPayload();
  }

  @Get('schools')
  @Throttle(PUBLIC_READ_THROTTLE)
  getSchools() {
    return this.publicService.getEligibleSchools();
  }
}

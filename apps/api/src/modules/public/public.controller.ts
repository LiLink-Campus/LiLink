import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createPublicReadThrottle } from '../../common/http/public-read-throttle';
import { PublicService } from './public.service';

@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('landing')
  @Throttle(createPublicReadThrottle())
  getLanding() {
    return this.publicService.getLandingPayload();
  }

  @Get('schools')
  @Throttle(createPublicReadThrottle())
  getSchools() {
    return this.publicService.getEligibleSchools();
  }
}

import { Controller, Get, Headers } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createPublicReadThrottle } from '../../common/http/public-read-throttle';
import { PublicService } from './public.service';

@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Get('landing')
  @Throttle(createPublicReadThrottle())
  getLanding(@Headers('x-locale') locale?: string) {
    return this.publicService.getLandingPayload(locale);
  }

  @Get('schools')
  @Throttle(createPublicReadThrottle())
  getSchools(@Headers('x-locale') locale?: string) {
    return this.publicService.getEligibleSchools(locale);
  }
}

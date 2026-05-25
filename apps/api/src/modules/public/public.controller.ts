import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PUBLIC_READ_THROTTLE } from '../../common/http/public-read-throttle';
import { PublicService } from './public.service';

@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

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

import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createPublicReadThrottle } from '../../common/http/public-read-throttle';

@Controller('health')
export class HealthController {
  @Get()
  @Throttle(createPublicReadThrottle())
  getHealth() {
    return {
      ok: true,
      service: 'lilink-api',
      timestamp: new Date().toISOString(),
    };
  }
}

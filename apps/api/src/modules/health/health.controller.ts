import { Controller, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PUBLIC_READ_THROTTLE } from '../../common/http/public-read-throttle';

@Controller('health')
export class HealthController {
  @Get()
  @Throttle(PUBLIC_READ_THROTTLE)
  getHealth() {
    return {
      ok: true,
      service: 'lilink-api',
      timestamp: new Date().toISOString(),
    };
  }
}

import {
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { env } from '../../config/env';
import { CyclesService } from './cycles.service';

@Controller('internal/cycles')
export class CyclesController {
  constructor(private readonly cyclesService: CyclesService) {}

  @Post('run')
  run(@Headers('x-cron-secret') secret?: string) {
    return this.tick(secret);
  }

  @Post('tick')
  tick(@Headers('x-cron-secret') secret?: string) {
    if (!this.hasValidCronSecret(secret)) {
      throw new UnauthorizedException('Cron secret is invalid.');
    }

    return this.cyclesService.runAutomationTick();
  }

  private hasValidCronSecret(secret?: string) {
    if (typeof secret !== 'string') {
      return false;
    }

    const expectedSecret = Buffer.from(env.CRON_SECRET);
    const receivedSecret = Buffer.from(secret);
    const compareLength = Math.max(
      expectedSecret.length,
      receivedSecret.length,
    );

    const paddedExpectedSecret = Buffer.alloc(compareLength);
    const paddedReceivedSecret = Buffer.alloc(compareLength);
    expectedSecret.copy(paddedExpectedSecret);
    receivedSecret.copy(paddedReceivedSecret);

    return (
      timingSafeEqual(paddedExpectedSecret, paddedReceivedSecret) &&
      expectedSecret.length === receivedSecret.length
    );
  }
}

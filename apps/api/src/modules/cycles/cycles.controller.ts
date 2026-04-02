import {
  Controller,
  Headers,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { env } from '../../config/env';
import { CyclesService } from './cycles.service';

@Controller('internal/cycles')
export class CyclesController {
  constructor(private readonly cyclesService: CyclesService) {}

  @Post('run')
  run(
    @Headers('x-cron-secret') secret?: string,
    @Headers('x-force-run') forceRun?: string,
  ) {
    if (secret !== env.CRON_SECRET) {
      throw new UnauthorizedException('Cron secret is invalid.');
    }

    return this.cyclesService.runRevealCycle({
      force: forceRun === '1' || forceRun === 'true',
    });
  }
}

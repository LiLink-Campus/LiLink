import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CyclesService } from './cycles.service';

@Injectable()
export class CyclesAutomationService {
  private readonly logger = new Logger(CyclesAutomationService.name);

  constructor(private readonly cyclesService: CyclesService) {}

  @Cron(CronExpression.EVERY_MINUTE, {
    name: 'cycle-automation-tick',
    waitForCompletion: true,
  })
  async handleTick() {
    try {
      await this.cyclesService.runAutomationTick();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown cycle automation error.';
      this.logger.error(`Cycle automation tick failed. ${message}`);
    }
  }
}

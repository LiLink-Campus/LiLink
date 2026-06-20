import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CyclesService } from './cycles.service';

@Injectable()
export class CyclesAutomationService {
  private readonly logger = new Logger(CyclesAutomationService.name);

  constructor(private readonly cyclesService: CyclesService) {}

  // Runs every 5 minutes, but isAutomationDue() gates the DB work: when no cycle
  // boundary is due the tick returns without querying, so Neon's compute can
  // scale to zero between cycles instead of being pinned awake by an
  // unconditional every-minute poll. A due cycle is therefore acted on within at
  // most one interval (<= ~5 min reveal latency).
  @Cron(CronExpression.EVERY_5_MINUTES, {
    name: 'cycle-automation-tick',
    waitForCompletion: true,
  })
  async handleTick() {
    if (!this.cyclesService.isAutomationDue()) {
      return;
    }

    try {
      await this.cyclesService.runAutomationTick();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown cycle automation error.';
      this.logger.error(`Cycle automation tick failed. ${message}`);
    } finally {
      try {
        await this.cyclesService.refreshAutomationSchedule();
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Unknown cycle schedule refresh error.';
        this.logger.error(
          `Cycle automation schedule refresh failed. ${message}`,
        );
      }
    }
  }
}

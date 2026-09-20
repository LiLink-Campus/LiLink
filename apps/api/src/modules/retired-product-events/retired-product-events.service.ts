import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { env } from '../../config/env';

@Injectable()
export class RetiredProductEventsService {
  private readonly logger = new Logger(RetiredProductEventsService.name);
  constructor(private readonly prisma: PrismaService) {}

  // Preserve the existing retention policy for retired analytics data.
  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: 'product-event-retention',
    waitForCompletion: true,
  })
  async handleRetention() {
    if (!env.BACKGROUND_JOBS_ENABLED || env.RELEASE_MAINTENANCE) return;
    try {
      await this.purgeExpiredEvents();
    } catch (error) {
      this.logger.error(
        'Failed to purge retired product events.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async purgeExpiredEvents(now = new Date()) {
    const where = {
      createdAt: { lt: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000) },
    };
    await this.prisma.productEvent.deleteMany({ where });
    await this.prisma.productEventOutbox.deleteMany({ where });
  }
}

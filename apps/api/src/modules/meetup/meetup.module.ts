import { Module } from '@nestjs/common';
import { ProductAnalyticsModule } from '../product-analytics/product-analytics.module';
import { MeetupController } from './meetup.controller';
import { MeetupService } from './meetup.service';

@Module({
  imports: [ProductAnalyticsModule],
  controllers: [MeetupController],
  providers: [MeetupService],
  exports: [MeetupService],
})
export class MeetupModule {}

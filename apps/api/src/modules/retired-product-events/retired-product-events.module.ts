import { Module } from '@nestjs/common';
import { RetiredProductEventsService } from './retired-product-events.service';
@Module({ providers: [RetiredProductEventsService] })
export class RetiredProductEventsModule {}

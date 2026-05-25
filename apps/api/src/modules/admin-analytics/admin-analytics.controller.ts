import { Controller, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../common/auth/admin.guard';
import { AdminAnalyticsService } from './admin-analytics.service';

@Controller('admin/analytics')
@UseGuards(AdminGuard)
export class AdminAnalyticsController {
  constructor(private readonly service: AdminAnalyticsService) {}
}

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../common/auth/admin.guard';
import { AdminAnalyticsService } from './admin-analytics.service';
import {
  AnalyticsBaseQueryDto,
  MatchLeaderboardQueryDto,
  WeeklyOptinQueryDto,
} from './dto/analytics-query.dto';

@Controller('admin/analytics')
@UseGuards(AdminGuard)
export class AdminAnalyticsController {
  constructor(private readonly service: AdminAnalyticsService) {}

  @Get('schools-gender')
  schoolsGender(@Query() query: AnalyticsBaseQueryDto) {
    return this.service.schoolsGender(query);
  }

  @Get('weekly-optin')
  weeklyOptin(@Query() query: WeeklyOptinQueryDto) {
    return this.service.weeklyOptin(query);
  }

  @Get('match-leaderboard')
  matchLeaderboard(@Query() query: MatchLeaderboardQueryDto) {
    return this.service.matchLeaderboard(query);
  }
}

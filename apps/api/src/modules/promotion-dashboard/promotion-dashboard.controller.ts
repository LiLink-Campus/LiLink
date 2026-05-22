import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../common/auth/admin.guard';
import {
  PromotionLeaderboardQueryDto,
  PromotionQueryDto,
  PromotionRedemptionsQueryDto,
} from './dto';
import { PromotionDashboardService } from './promotion-dashboard.service';

@Controller('admin/promotion')
@UseGuards(AdminGuard)
export class PromotionDashboardController {
  constructor(
    private readonly promotionDashboardService: PromotionDashboardService,
  ) {}

  @Get('funnel')
  funnel(@Query() query: PromotionQueryDto) {
    return this.promotionDashboardService.getFunnel(query);
  }

  @Get('leaderboard')
  leaderboard(@Query() query: PromotionLeaderboardQueryDto) {
    return this.promotionDashboardService.getLeaderboard(query);
  }

  @Get('coupons')
  coupons(@Query() query: PromotionQueryDto) {
    return this.promotionDashboardService.getCoupons(query);
  }

  @Get('redemptions')
  redemptions(@Query() query: PromotionRedemptionsQueryDto) {
    return this.promotionDashboardService.getRedemptions(query);
  }
}

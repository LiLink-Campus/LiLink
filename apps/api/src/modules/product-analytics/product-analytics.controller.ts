import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../../common/auth/jwt-auth.guard';
import { CreateProductEventDto } from './dto';
import { ProductAnalyticsService } from './product-analytics.service';

@Controller('product-events')
@UseGuards(JwtAuthGuard)
export class ProductAnalyticsController {
  constructor(private readonly analyticsService: ProductAnalyticsService) {}

  @Post()
  @HttpCode(202)
  record(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateProductEventDto,
  ) {
    return this.analyticsService.recordBrowserEvent(request.user!.sub, dto);
  }
}

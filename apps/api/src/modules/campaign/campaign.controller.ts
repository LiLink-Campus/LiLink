import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../../common/auth/admin.guard';
import type { AdminAuthenticatedRequest } from '../../common/auth/admin.guard';
import {
  CreateCampaignDto,
  CreateCouponTemplateDto,
  ListCampaignsQueryDto,
  UpdateCampaignDto,
  UpdateCouponTemplateDto,
} from './dto';
import { CampaignService } from './campaign.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class CampaignAdminController {
  constructor(private readonly campaignService: CampaignService) {}

  @Get('campaigns')
  listCampaigns(@Query() query: ListCampaignsQueryDto) {
    return this.campaignService.listCampaigns(query);
  }

  @Post('campaigns')
  createCampaign(
    @Req() request: AdminAuthenticatedRequest,
    @Body() body: CreateCampaignDto,
  ) {
    return this.campaignService.createCampaign(body, request.admin!.id);
  }

  @Patch('campaigns/:id')
  updateCampaign(
    @Req() request: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateCampaignDto,
  ) {
    return this.campaignService.updateCampaign(id, body, request.admin!.id);
  }

  @Get('campaigns/:id/templates')
  listTemplates(@Param('id') id: string) {
    return this.campaignService.listTemplates(id);
  }

  @Post('campaigns/:id/templates')
  createTemplate(
    @Req() request: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: CreateCouponTemplateDto,
  ) {
    return this.campaignService.createTemplate(id, body, request.admin!.id);
  }

  @Patch('coupon-templates/:id')
  updateTemplate(
    @Req() request: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateCouponTemplateDto,
  ) {
    return this.campaignService.updateTemplate(id, body, request.admin!.id);
  }
}

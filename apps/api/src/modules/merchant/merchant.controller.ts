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
  CreateMerchantDto,
  ListMerchantsQueryDto,
  UpdateMerchantDto,
} from './dto';
import { MerchantService } from './merchant.service';

@Controller('admin/merchants')
@UseGuards(AdminGuard)
export class MerchantAdminController {
  constructor(private readonly merchantService: MerchantService) {}

  @Get()
  list(@Query() query: ListMerchantsQueryDto) {
    return this.merchantService.listMerchants(query);
  }

  @Post()
  create(
    @Req() request: AdminAuthenticatedRequest,
    @Body() body: CreateMerchantDto,
  ) {
    return this.merchantService.createMerchant(body, request.admin!.id);
  }

  @Patch(':id')
  update(
    @Req() request: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateMerchantDto,
  ) {
    return this.merchantService.updateMerchant(id, body, request.admin!.id);
  }
}

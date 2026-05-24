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
  CreateMerchantUserDto,
  ListMerchantsQueryDto,
  UpdateMerchantDto,
  UpdateMerchantUserDto,
} from './dto';
import { MerchantService } from './merchant.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class MerchantAdminController {
  constructor(private readonly merchantService: MerchantService) {}

  @Get('merchants')
  list(@Query() query: ListMerchantsQueryDto) {
    return this.merchantService.listMerchants(query);
  }

  @Post('merchants')
  create(
    @Req() request: AdminAuthenticatedRequest,
    @Body() body: CreateMerchantDto,
  ) {
    return this.merchantService.createMerchant(body, request.admin!.id);
  }

  @Patch('merchants/:id')
  update(
    @Req() request: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateMerchantDto,
  ) {
    return this.merchantService.updateMerchant(id, body, request.admin!.id);
  }

  @Get('merchants/:id/users')
  listUsers(@Param('id') id: string) {
    return this.merchantService.listMerchantUsers(id);
  }

  @Post('merchants/:id/users')
  createUser(
    @Req() request: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: CreateMerchantUserDto,
  ) {
    return this.merchantService.createMerchantUser(id, body, request.admin!.id);
  }

  @Patch('merchant-users/:id')
  updateUser(
    @Req() request: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: UpdateMerchantUserDto,
  ) {
    return this.merchantService.updateMerchantUser(id, body, request.admin!.id);
  }
}

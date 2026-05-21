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
  CreateInviteCodeDto,
  ListInviteCodesQueryDto,
  SetInviteCodeActiveDto,
} from './dto';
import { InviteCodeService } from './invite-code.service';

@Controller('admin/invite-codes')
@UseGuards(AdminGuard)
export class InviteCodeAdminController {
  constructor(private readonly inviteCodeService: InviteCodeService) {}

  @Get()
  list(@Query() query: ListInviteCodesQueryDto) {
    return this.inviteCodeService.listInviteCodes(query);
  }

  @Post()
  create(
    @Req() request: AdminAuthenticatedRequest,
    @Body() body: CreateInviteCodeDto,
  ) {
    return this.inviteCodeService.createInviteCode(
      body.ownerName,
      request.admin!.id,
    );
  }

  @Patch(':id')
  setActive(
    @Req() request: AdminAuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: SetInviteCodeActiveDto,
  ) {
    return this.inviteCodeService.setInviteCodeActive(
      id,
      body.isActive,
      request.admin!.id,
    );
  }
}

import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../common/auth/jwt-auth.guard';
import { VipService } from './vip.service';

export class ActivateVipDto {
  @IsString()
  @MinLength(24)
  @MaxLength(64)
  code!: string;
}

@Controller('me/vip')
@UseGuards(JwtAuthGuard)
export class VipController {
  constructor(private readonly vip: VipService) {}

  @Get()
  status(@Req() request: AuthenticatedRequest) {
    return this.vip.getStatus(request.user!.sub);
  }

  @Post('activate')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  activate(@Req() request: AuthenticatedRequest, @Body() body: ActivateVipDto) {
    return this.vip.activate(request.user!.sub, body.code);
  }
}

import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AdminGuard } from '../../common/auth/admin.guard';
import type { AdminAuthenticatedRequest } from '../../common/auth/admin.guard';
import {
  adminSessionConfig,
  createSessionClearCookieOptions,
  createSessionCookieOptions,
} from '../../common/auth/session-config';
import { env } from '../../config/env';
import { AdminLoginDto } from './dto';
import { AdminSessionService } from './admin-session.service';
import { createAdminLoginThrottle } from './admin-session-throttle';

@Controller('admin-session')
export class AdminSessionController {
  constructor(private readonly adminSessionService: AdminSessionService) {}

  @Post('login')
  @Throttle(createAdminLoginThrottle())
  async login(
    @Body() body: AdminLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const payload = await this.adminSessionService.login(
      body.email,
      body.password,
    );

    response.cookie(
      env.ADMIN_COOKIE_NAME,
      payload.token,
      createSessionCookieOptions(adminSessionConfig.cookieMaxAgeMs),
    );

    return {
      ok: true,
      admin: payload.admin,
    };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(
      env.ADMIN_COOKIE_NAME,
      createSessionClearCookieOptions(),
    );

    return { ok: true };
  }

  @Get('me')
  @UseGuards(AdminGuard)
  me(@Req() request: AdminAuthenticatedRequest) {
    return this.adminSessionService.getMe(request.admin!.id);
  }
}

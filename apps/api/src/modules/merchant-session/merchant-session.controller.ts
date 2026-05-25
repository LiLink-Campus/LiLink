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
import { MerchantGuard } from '../../common/auth/merchant.guard';
import type { MerchantAuthenticatedRequest } from '../../common/auth/merchant.guard';
import {
  createSessionClearCookieOptions,
  createSessionCookieOptions,
  merchantSessionConfig,
} from '../../common/auth/session-config';
import { env } from '../../config/env';
import { MerchantLoginDto } from './dto';
import { MerchantSessionService } from './merchant-session.service';
import { MERCHANT_LOGIN_THROTTLE } from './merchant-session-throttle';

@Controller('merchant/auth')
export class MerchantSessionController {
  constructor(
    private readonly merchantSessionService: MerchantSessionService,
  ) {}

  @Post('login')
  @Throttle(MERCHANT_LOGIN_THROTTLE)
  async login(
    @Body() body: MerchantLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const payload = await this.merchantSessionService.login(
      body.email,
      body.password,
    );

    response.cookie(
      env.MERCHANT_COOKIE_NAME,
      payload.token,
      createSessionCookieOptions(merchantSessionConfig.cookieMaxAgeMs),
    );

    return { ok: true, merchantUser: payload.merchantUser };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(
      env.MERCHANT_COOKIE_NAME,
      createSessionClearCookieOptions(),
    );

    return { ok: true };
  }

  @Get('me')
  @UseGuards(MerchantGuard)
  me(@Req() request: MerchantAuthenticatedRequest) {
    return this.merchantSessionService.getMe(request.merchantUser!.id);
  }
}

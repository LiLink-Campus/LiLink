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
import { LOCALE_COOKIE_NAME, parseSupportedLocale } from '@lilink/shared';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import {
  LoginDto,
  RegisterDto,
  RequestCodeDto,
  RequestPasswordResetCodeDto,
  ResetPasswordDto,
} from './dto';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../common/auth/jwt-auth.guard';
import { env } from '../../config/env';
import {
  createSessionClearCookieOptions,
  createSessionCookieOptions,
  userSessionConfig,
} from '../../common/auth/session-config';
import { createPublicAuthThrottle } from './auth-throttle';

type RequestWithCookies = Request & {
  cookies?: Record<string, unknown>;
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('request-code')
  @Throttle(createPublicAuthThrottle('requestCode'))
  requestCode(@Body() body: RequestCodeDto) {
    return this.authService.requestCode(body.email, body.referralCode);
  }

  @Post('register')
  @Throttle(createPublicAuthThrottle('register'))
  async register(
    @Body() body: RegisterDto,
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { token, ...payload } = await this.authService.register(
      body,
      this.readLocaleCookie(request),
    );
    this.attachAuthCookie(response, token);
    return payload;
  }

  @Post('request-password-reset-code')
  @Throttle(createPublicAuthThrottle('requestPasswordResetCode'))
  requestPasswordResetCode(@Body() body: RequestPasswordResetCodeDto) {
    return this.authService.requestPasswordResetCode(body.email);
  }

  @Post('reset-password')
  @Throttle(createPublicAuthThrottle('resetPassword'))
  async resetPassword(
    @Body() body: ResetPasswordDto,
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { token, ...payload } = await this.authService.resetPassword(
      body,
      this.readLocaleCookie(request),
    );
    this.attachAuthCookie(response, token);
    return payload;
  }

  @Post('login')
  @Throttle(createPublicAuthThrottle('login'))
  async login(
    @Body() body: LoginDto,
    @Req() request: RequestWithCookies,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { token, ...payload } = await this.authService.login(
      body,
      this.readLocaleCookie(request),
    );
    this.attachAuthCookie(response, token);
    return payload;
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(env.COOKIE_NAME, createSessionClearCookieOptions());

    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    return this.authService.getMe(request.user!.sub);
  }

  private attachAuthCookie(response: Response, token: string) {
    response.cookie(
      env.COOKIE_NAME,
      token,
      createSessionCookieOptions(userSessionConfig.cookieMaxAgeMs),
    );
  }

  private readLocaleCookie(request: RequestWithCookies) {
    const rawLocale: unknown = request.cookies?.[LOCALE_COOKIE_NAME];

    return parseSupportedLocale(rawLocale);
  }
}

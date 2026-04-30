import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
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

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('request-code')
  @Throttle(createPublicAuthThrottle('requestCode'))
  requestCode(
    @Body() body: RequestCodeDto,
    @Headers('x-locale') locale?: string,
  ) {
    return this.authService.requestCode(body.email, locale);
  }

  @Post('register')
  @Throttle(createPublicAuthThrottle('register'))
  async register(
    @Body() body: RegisterDto,
    @Res({ passthrough: true }) response: Response,
    @Headers('x-locale') locale?: string,
  ) {
    const { token, ...payload } = await this.authService.register(body, locale);
    this.attachAuthCookie(response, token);
    return payload;
  }

  @Post('request-password-reset-code')
  @Throttle(createPublicAuthThrottle('requestPasswordResetCode'))
  requestPasswordResetCode(
    @Body() body: RequestPasswordResetCodeDto,
    @Headers('x-locale') locale?: string,
  ) {
    return this.authService.requestPasswordResetCode(body.email, locale);
  }

  @Post('reset-password')
  @Throttle(createPublicAuthThrottle('resetPassword'))
  async resetPassword(
    @Body() body: ResetPasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { token, ...payload } = await this.authService.resetPassword(body);
    this.attachAuthCookie(response, token);
    return payload;
  }

  @Post('login')
  @Throttle(createPublicAuthThrottle('login'))
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { token, ...payload } = await this.authService.login(body);
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
}

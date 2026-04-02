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
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, RequestCodeDto } from './dto';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../common/auth/jwt-auth.guard';
import { env } from '../../config/env';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('request-code')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  requestCode(@Body() body: RequestCodeDto) {
    return this.authService.requestCode(body.email);
  }

  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async register(
    @Body() body: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { token, ...payload } = await this.authService.register(body);
    this.attachAuthCookie(response, token);
    return payload;
  }

  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
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
    response.clearCookie(env.COOKIE_NAME, {
      domain: env.COOKIE_DOMAIN || undefined,
      httpOnly: true,
      sameSite: 'lax',
      secure: env.APP_ENV === 'production',
    });

    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() request: AuthenticatedRequest) {
    return this.authService.getMe(request.user!.sub);
  }

  private attachAuthCookie(response: Response, token: string) {
    response.cookie(env.COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.APP_ENV === 'production',
      domain: env.COOKIE_DOMAIN || undefined,
      maxAge: 1000 * 60 * 60 * 24 * 14,
      path: '/',
    });
  }
}

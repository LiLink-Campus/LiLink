import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createHash } from 'crypto';
import type { ReferralChannel } from '@lilink/shared';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../../common/auth/jwt-auth.guard';
import { getRealClientIp } from '../../common/http/client-ip';
import { createPublicReadThrottle } from '../../common/http/public-read-throttle';
import { env } from '../../config/env';
import { CreateReferralClickDto, CreateReferralEventDto } from './dto';
import { ReferralService } from './referral.service';

@Controller()
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me/referral')
  getMyReferral(@Req() request: AuthenticatedRequest) {
    return this.referralService.getMyReferralOverview(request.user!.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('referral/events')
  async recordShare(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateReferralEventDto,
  ) {
    await this.referralService.recordShareEvent(
      request.user!.sub,
      dto.channel as ReferralChannel,
    );
    return { ok: true };
  }

  // Public + throttled, no auth. Derives an anonymous visitor hash from the
  // real client IP + UA (salted with JWT_SECRET) purely for UV dedupe; the raw
  // IP/UA are never persisted.
  @Throttle(createPublicReadThrottle())
  @Post('referral/click')
  recordClick(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateReferralClickDto,
  ) {
    const ip = getRealClientIp(request);
    const userAgent = String(request.headers['user-agent'] ?? '');
    const visitorHash = createHash('sha256')
      .update(`${env.JWT_SECRET}\n${ip}\n${userAgent}`)
      .digest('hex');
    return this.referralService.recordClickEvent({
      code: dto.code,
      channel: dto.channel,
      visitorHash,
    });
  }
}

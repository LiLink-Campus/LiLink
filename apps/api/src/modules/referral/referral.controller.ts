import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createHash } from 'crypto';
import type { ReferralChannel } from '@lilink/shared';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../../common/auth/jwt-auth.guard';
import { isBotUserAgent } from '../../common/http/bot-user-agent';
import { getRealClientIp } from '../../common/http/client-ip';
import { REFERRAL_CLICK_THROTTLE } from '../../common/http/referral-click-throttle';
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
      dto.campaignSlug,
    );
    return { ok: true };
  }

  // Public + throttled, no auth. Bots / link-preview prefetch (incl. empty UA)
  // are skipped so they don't pollute the funnel. A salted visitor hash from the
  // real client IP + UA drives UV dedup; raw IP/UA are never persisted.
  @Throttle(REFERRAL_CLICK_THROTTLE)
  @Post('referral/click')
  recordClick(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateReferralClickDto,
  ) {
    const userAgent = String(request.headers['user-agent'] ?? '');
    if (isBotUserAgent(userAgent)) {
      return { result: 'OK' as const };
    }
    const ip = getRealClientIp(request);
    const visitorHash = createHash('sha256')
      .update(`${env.JWT_SECRET}\n${ip}\n${userAgent}`)
      .digest('hex');
    return this.referralService.recordClickEvent({
      code: dto.code,
      channel: dto.channel,
      campaignSlug: dto.campaignSlug,
      visitorHash,
    });
  }
}

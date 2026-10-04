import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { env } from '../../config/env';
import { PublicCachePublicationService } from './public-cache-publication.service';

@Controller('internal/public-cache')
export class PublicCachePublicationController {
  constructor(private readonly publication: PublicCachePublicationService) {}

  @Post('verify')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { ttl: 60_000, limit: 12 } })
  async verify(
    @Body() payload: unknown,
    @Headers('x-lilink-timestamp') timestamp = '',
    @Headers('x-lilink-signature') signature = '',
  ) {
    const secret = env.PUBLIC_CACHE_REVALIDATION_SECRET;
    if (!secret) throw new ServiceUnavailableException();
    if (
      !payload ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      (payload as Record<string, unknown>).scope !== 'home' ||
      Object.keys(payload).length !== 1
    ) {
      throw new BadRequestException();
    }
    if (
      !/^\d{10}$/.test(timestamp) ||
      !/^[a-f0-9]{64}$/.test(signature) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
    )
      throw new UnauthorizedException();
    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.{"scope":"home"}`)
      .digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
      throw new UnauthorizedException();
    return { outcome: await this.publication.verify() };
  }
}

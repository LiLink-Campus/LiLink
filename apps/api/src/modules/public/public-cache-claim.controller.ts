import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../../common/prisma/prisma.service';
import { env } from '../../config/env';

@Controller('internal/public-cache')
export class PublicCacheClaimController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('claim')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  async claim(
    @Body() payload: unknown,
    @Headers('x-lilink-timestamp') timestamp = '',
    @Headers('x-lilink-signature') signature = '',
  ) {
    const secret = env.PUBLIC_CACHE_REVALIDATION_SECRET;
    if (!secret) throw new ServiceUnavailableException();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new BadRequestException();
    }
    const { scope, revision } = payload as Record<string, unknown>;
    if (
      (scope !== 'home' && scope !== 'schools') ||
      typeof revision !== 'string' ||
      !/^[1-9]\d{0,18}$/.test(revision) ||
      BigInt(revision) > 9223372036854775807n ||
      Object.keys(payload).length !== 2
    )
      throw new BadRequestException();
    if (
      !/^\d{10}$/.test(timestamp) ||
      !/^[a-f0-9]{64}$/.test(signature) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
    ) {
      throw new UnauthorizedException();
    }
    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${JSON.stringify({ scope, revision })}`)
      .digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) {
      throw new UnauthorizedException();
    }
    const requested = BigInt(revision);
    // Persist the grant before the external side effect. A crash uses the TTL
    // recovery path; retries never grant the same revision a second time.
    const granted = await this.prisma.$queryRaw<Array<{ scope: string }>>`
      UPDATE "PublicCacheInvalidation"
      SET "claimedRevision" = ${requested}, "lastClaimedAt" = CURRENT_TIMESTAMP
      WHERE "scope" = ${scope} AND "revision" >= ${requested}
        AND "claimedRevision" < ${requested}
        AND ("lastClaimedAt" IS NULL OR "lastClaimedAt" <= CURRENT_TIMESTAMP - INTERVAL '30 minutes')
      RETURNING "scope"
    `;
    if (granted.length === 1) return { decision: 'invalidate' };
    const row = await this.prisma.publicCacheInvalidation.findUnique({
      where: { scope },
    });
    if (!row || requested > row.revision) throw new BadRequestException();
    if (requested <= row.claimedRevision) return { decision: 'duplicate' };
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(
        ((row.lastClaimedAt?.getTime() ?? Date.now()) +
          1_800_000 -
          Date.now()) /
          1000,
      ),
    );
    return { decision: 'deferred', retryAfterSeconds };
  }
}

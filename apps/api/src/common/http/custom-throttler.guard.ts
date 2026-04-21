import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { getRealClientIp } from './client-ip';

/**
 * Default ThrottlerGuard buckets requests by req.ip, which behind
 * Cloudflare is the CF edge address rather than the actual user. Every
 * bucket that does not declare its own `getTracker` (default 1000/min,
 * public-read 20000/min, auth login/signup/reset, admin login) routes
 * through this guard, so overriding `getTracker` once here propagates
 * the fix everywhere.
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(getRealClientIp(req as Parameters<typeof getRealClientIp>[0]));
  }
}

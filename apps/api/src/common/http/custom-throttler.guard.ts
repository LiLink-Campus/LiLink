import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { env } from '../../config/env';
import { getRealClientIp } from './client-ip';

/** Use verified sessions for account requests and client IPs for public routes. */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  private readonly tokenVerifier = new JwtService();

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    // Signed user identity prevents shared SSR/NAT egress from merging user buckets.
    // Public auth and redemption routes retain their independent IP limits.
    const path =
      typeof req.originalUrl === 'string' ? req.originalUrl.split('?')[0] : '';
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const token = cookies?.[env.COOKIE_NAME];
    if (path.startsWith('/v1/me/') && typeof token === 'string') {
      try {
        const payload = await this.tokenVerifier.verifyAsync<{ sub?: string }>(
          token,
          { secret: env.JWT_SECRET },
        );
        if (typeof payload.sub === 'string' && payload.sub.length)
          return `user:${payload.sub}`;
      } catch {
        /* Invalid sessions remain in the IP bucket and fail authentication. */
      }
    }
    return getRealClientIp(req as Parameters<typeof getRealClientIp>[0]);
  }
}

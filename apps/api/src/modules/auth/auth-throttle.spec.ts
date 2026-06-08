import type { ExecutionContext } from '@nestjs/common';
import {
  createPublicAuthThrottle,
  getAuthEmailThrottleTracker,
  getAuthReferralThrottleTracker,
  isPublicAuthThrottleRequest,
  publicAuthRouteThrottles,
  shouldSkipAuthReferralThrottle,
} from './auth-throttle';

const stubContext = {} as ExecutionContext;

function referralSkipContext(request: {
  method?: string;
  path?: string;
  body?: { email?: unknown; referralCode?: unknown };
}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('auth throttle helpers', () => {
  it('uses the normalized email as the auth email throttle tracker', () => {
    expect(
      getAuthEmailThrottleTracker(
        {
          body: { email: ' User@Example.com ' },
          ip: '203.0.113.9',
        },
        stubContext,
      ),
    ).toBe('email:user@example.com');
  });

  it('falls back to the client ip when the email is missing', () => {
    expect(
      getAuthEmailThrottleTracker(
        {
          body: {},
          ip: '203.0.113.9',
          socket: { remoteAddress: '203.0.113.9' },
        },
        stubContext,
      ),
    ).toBe('ip:203.0.113.9');
  });

  it('recognizes the public auth routes that need the email throttler', () => {
    expect(
      isPublicAuthThrottleRequest({
        method: 'POST',
        path: '/v1/auth/request-code',
      }),
    ).toBe(true);
    expect(
      isPublicAuthThrottleRequest({
        method: 'GET',
        path: '/v1/auth/me',
      }),
    ).toBe(false);
  });

  it('recognizes router-equivalent request-code variants (trailing slash, casing, double slash)', () => {
    for (const path of [
      '/v1/auth/request-code/',
      '/v1/auth/REQUEST-CODE',
      '/v1/auth//request-code',
    ]) {
      expect(isPublicAuthThrottleRequest({ method: 'POST', path })).toBe(true);
    }
  });

  it('builds a dual-layer throttle definition for public auth routes', () => {
    expect(createPublicAuthThrottle('register')).toEqual({
      default: {
        ttl: publicAuthRouteThrottles.register.ttlMs,
        limit: publicAuthRouteThrottles.register.ipLimit,
      },
      authEmail: {
        ttl: publicAuthRouteThrottles.register.ttlMs,
        limit: publicAuthRouteThrottles.register.emailLimit,
        getTracker: getAuthEmailThrottleTracker,
      },
    });
  });

  it('normalizes the referral code as the per-code throttle tracker', () => {
    expect(
      getAuthReferralThrottleTracker(
        {
          body: { email: 'user@qq.com', referralCode: ' abcDEF1234 ' },
          ip: '203.0.113.9',
        },
        stubContext,
      ),
    ).toBe('referral:ABCDEF1234');
  });

  it('falls back to the client ip when no referral code is present', () => {
    expect(
      getAuthReferralThrottleTracker(
        {
          body: { email: 'user@qq.com' },
          ip: '203.0.113.9',
          socket: { remoteAddress: '203.0.113.9' },
        },
        stubContext,
      ),
    ).toBe('ip:203.0.113.9');
  });

  it('adds a per-referral-code bucket only for request-code', () => {
    expect(createPublicAuthThrottle('requestCode')).toEqual({
      default: {
        ttl: publicAuthRouteThrottles.requestCode.ttlMs,
        limit: publicAuthRouteThrottles.requestCode.ipLimit,
      },
      authEmail: {
        ttl: publicAuthRouteThrottles.requestCode.ttlMs,
        limit: publicAuthRouteThrottles.requestCode.emailLimit,
        getTracker: getAuthEmailThrottleTracker,
      },
      authReferral: {
        ttl: publicAuthRouteThrottles.requestCode.ttlMs,
        limit: publicAuthRouteThrottles.requestCode.referralLimit,
        getTracker: getAuthReferralThrottleTracker,
      },
    });

    expect(createPublicAuthThrottle('login')).not.toHaveProperty(
      'authReferral',
    );
  });

  it('keeps the per-referral-code throttle active for request-code variants carrying a code', () => {
    for (const path of [
      '/v1/auth/request-code',
      '/v1/auth/request-code/',
      '/v1/auth/REQUEST-CODE',
    ]) {
      expect(
        shouldSkipAuthReferralThrottle(
          referralSkipContext({
            method: 'POST',
            path,
            body: { referralCode: 'ABCDEF1234' },
          }),
        ),
      ).toBe(false);
    }
  });

  it('skips the per-referral-code throttle for code-less request-code and other routes', () => {
    expect(
      shouldSkipAuthReferralThrottle(
        referralSkipContext({
          method: 'POST',
          path: '/v1/auth/request-code',
          body: {},
        }),
      ),
    ).toBe(true);
    expect(
      shouldSkipAuthReferralThrottle(
        referralSkipContext({
          method: 'POST',
          path: '/v1/auth/register',
          body: { referralCode: 'ABCDEF1234' },
        }),
      ),
    ).toBe(true);
  });
});

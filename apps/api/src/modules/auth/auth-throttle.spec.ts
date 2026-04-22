import type { ExecutionContext } from '@nestjs/common';
import {
  createPublicAuthThrottle,
  getAuthEmailThrottleTracker,
  isPublicAuthThrottleRequest,
  publicAuthRouteThrottles,
} from './auth-throttle';

const stubContext = {} as ExecutionContext;

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
});

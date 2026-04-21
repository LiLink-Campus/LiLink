import type { ExecutionContext } from '@nestjs/common';
import type {
  ThrottlerGetTrackerFunction,
  ThrottlerOptions,
} from '@nestjs/throttler';

type AuthThrottleRequest = {
  body?: {
    email?: unknown;
  };
  ip?: string;
  path?: string;
  url?: string;
  method?: string;
};

type PublicAuthRouteKey =
  | 'requestCode'
  | 'register'
  | 'requestPasswordResetCode'
  | 'resetPassword'
  | 'login';

type PublicAuthRouteThrottle = {
  emailLimit: number;
  ipLimit: number;
  ttlMs: number;
};

const AUTH_EMAIL_THROTTLER_NAME = 'authEmail';
const AUTH_THROTTLE_TTL_MS = 60_000;
const PUBLIC_SIGNUP_IP_LIMIT = 1000;
const AUTH_THROTTLE_ROUTE_SIGNATURES = new Set([
  'POST:/v1/auth/request-code',
  'POST:/v1/auth/register',
  'POST:/v1/auth/request-password-reset-code',
  'POST:/v1/auth/reset-password',
  'POST:/v1/auth/login',
]);

export const publicAuthRouteThrottles: Record<
  PublicAuthRouteKey,
  PublicAuthRouteThrottle
> = {
  requestCode: {
    emailLimit: 3,
    ipLimit: PUBLIC_SIGNUP_IP_LIMIT,
    ttlMs: AUTH_THROTTLE_TTL_MS,
  },
  register: {
    emailLimit: 5,
    ipLimit: PUBLIC_SIGNUP_IP_LIMIT,
    ttlMs: AUTH_THROTTLE_TTL_MS,
  },
  requestPasswordResetCode: {
    emailLimit: 3,
    ipLimit: 60,
    ttlMs: AUTH_THROTTLE_TTL_MS,
  },
  resetPassword: {
    emailLimit: 5,
    ipLimit: 60,
    ttlMs: AUTH_THROTTLE_TTL_MS,
  },
  login: {
    emailLimit: 5,
    ipLimit: 120,
    ttlMs: AUTH_THROTTLE_TTL_MS,
  },
};

function extractNormalizedEmail(request: AuthThrottleRequest): string | null {
  const email = request.body?.email;
  if (typeof email !== 'string') {
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();
  return normalizedEmail || null;
}

function getRequestSignature(request: AuthThrottleRequest): string | null {
  const method = request.method?.toUpperCase();
  const rawPath = request.path ?? request.url;
  if (!method || typeof rawPath !== 'string') {
    return null;
  }

  const normalizedPath = rawPath.split('?')[0];
  return `${method}:${normalizedPath}`;
}

export function isPublicAuthThrottleRequest(
  request: AuthThrottleRequest,
): boolean {
  const signature = getRequestSignature(request);
  if (!signature) {
    return false;
  }

  return AUTH_THROTTLE_ROUTE_SIGNATURES.has(signature);
}

export const getAuthEmailThrottleTracker: ThrottlerGetTrackerFunction = (
  request: AuthThrottleRequest,
) => {
  const normalizedEmail = extractNormalizedEmail(request);
  if (normalizedEmail) {
    return `email:${normalizedEmail}`;
  }

  return `ip:${request.ip ?? 'unknown'}`;
};

export function shouldSkipAuthEmailThrottle(
  context: ExecutionContext,
): boolean {
  const request = context.switchToHttp().getRequest<AuthThrottleRequest>();
  return !isPublicAuthThrottleRequest(request);
}

export const authEmailThrottler: ThrottlerOptions = {
  name: AUTH_EMAIL_THROTTLER_NAME,
  ttl: AUTH_THROTTLE_TTL_MS,
  limit: Number.MAX_SAFE_INTEGER,
  skipIf: shouldSkipAuthEmailThrottle,
  getTracker: getAuthEmailThrottleTracker,
};

export function createPublicAuthThrottle(route: PublicAuthRouteKey) {
  const throttle = publicAuthRouteThrottles[route];

  return {
    default: {
      ttl: throttle.ttlMs,
      limit: throttle.ipLimit,
    },
    [AUTH_EMAIL_THROTTLER_NAME]: {
      ttl: throttle.ttlMs,
      limit: throttle.emailLimit,
      getTracker: getAuthEmailThrottleTracker,
    },
  };
}

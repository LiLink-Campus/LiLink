import type { ExecutionContext } from '@nestjs/common';
import type {
  ThrottlerGetTrackerFunction,
  ThrottlerOptions,
} from '@nestjs/throttler';
import { getRealClientIp } from '../../common/http/client-ip';

type AuthThrottleRequest = {
  body?: {
    email?: unknown;
    referralCode?: unknown;
  };
  headers?: Record<string, unknown>;
  ip?: string;
  ips?: readonly string[];
  socket?: { remoteAddress?: string };
  connection?: { remoteAddress?: string };
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
  // Optional override for the per-email window (defaults to ttlMs). request-code
  // uses a tighter 30s window so one inbox can receive at most one verification
  // code every 30s, instead of the default per-minute allowance.
  emailTtlMs?: number;
  ipLimit: number;
  ttlMs: number;
  // Optional per-referral-code cap. Only request-code sets this: it bounds how
  // many verification emails a single referral code can fan out per window,
  // independent of the target email. Without it, one reusable valid code could
  // be replayed to blast verification mail at arbitrary inboxes up to the much
  // larger per-IP ceiling (the request-code precheck only reads the referrer's
  // quota, it never consumes it).
  referralLimit?: number;
};

const AUTH_EMAIL_THROTTLER_NAME = 'authEmail';
const AUTH_REFERRAL_THROTTLER_NAME = 'authReferral';
const AUTH_THROTTLE_TTL_MS = 60_000;
const PUBLIC_SIGNUP_IP_LIMIT = 1000;
// request-code per-email cap: one verification code per email per 30s. This
// bounds per-inbox verification-mail spam (the register page mirrors it as a
// resend cooldown) and is tighter than the old 3/min allowance.
const PUBLIC_REQUEST_CODE_EMAIL_LIMIT = 1;
const PUBLIC_REQUEST_CODE_EMAIL_TTL_MS = 30_000;
// Per-referral-code request-code cap. Generous enough for organic invite bursts
// (a referrer's default non-edu quota is only 3) yet ~100x below the per-IP
// ceiling. It bounds — but does not eliminate — verification-mail fan-out: a
// shared code can still reach up to this many distinct inboxes per window (the
// per-email cap below blocks repeat mail to any single inbox), so
// logNonSchoolRequestCode records a redacted code + domain for abuse monitoring.
const PUBLIC_REQUEST_CODE_REFERRAL_LIMIT = 10;
const REQUEST_CODE_ROUTE_SIGNATURE = 'POST:/v1/auth/request-code';
const AUTH_THROTTLE_ROUTE_SIGNATURES = new Set([
  REQUEST_CODE_ROUTE_SIGNATURE,
  'POST:/v1/auth/register',
  'POST:/v1/auth/request-password-reset-code',
  'POST:/v1/auth/reset-password',
  'POST:/v1/auth/login',
]);

/**
 * @internal Exported for throttling tests.
 */
export const publicAuthRouteThrottles: Record<
  PublicAuthRouteKey,
  PublicAuthRouteThrottle
> = {
  requestCode: {
    emailLimit: PUBLIC_REQUEST_CODE_EMAIL_LIMIT,
    emailTtlMs: PUBLIC_REQUEST_CODE_EMAIL_TTL_MS,
    ipLimit: PUBLIC_SIGNUP_IP_LIMIT,
    referralLimit: PUBLIC_REQUEST_CODE_REFERRAL_LIMIT,
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
    // Sized for shared-egress networks (campus NAT / corporate LAN) where
    // hundreds of legitimate logins can land on the same source IP within a
    // minute. Brute-force protection still relies on the per-email cap above.
    ipLimit: 600,
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

function extractNormalizedReferralCode(
  request: AuthThrottleRequest,
): string | null {
  const referralCode = request.body?.referralCode;
  if (typeof referralCode !== 'string') {
    return null;
  }

  // Mirror the service-side normalization (trim + uppercase) so the same code
  // maps to one bucket regardless of how the caller cased/padded it.
  const normalizedCode = referralCode.trim().toUpperCase();
  return normalizedCode || null;
}

function getRequestSignature(request: AuthThrottleRequest): string | null {
  const method = request.method?.toUpperCase();
  const rawPath = request.path ?? request.url;
  if (!method || typeof rawPath !== 'string') {
    return null;
  }

  // Canonicalize the path so router-equivalent variants collapse to one
  // signature. Express matches routes case-insensitively and ignores a trailing
  // slash, so without this `/v1/auth/REQUEST-CODE` or `/v1/auth/request-code/`
  // would reach the same handler yet produce a non-matching signature, dodging
  // the per-email / per-referral skip guards below and falling through to the
  // looser per-IP default bucket. The route signature constants are already
  // lower-case and slash-canonical. (Lower-casing + trailing-slash stripping are
  // the load-bearing steps; the double-slash fold below is belt-and-suspenders,
  // since Express 5 already 404s a `//` path before it reaches the handler.)
  const pathWithoutQuery = rawPath.split('?')[0].toLowerCase();
  const collapsedPath = pathWithoutQuery.replace(/\/{2,}/g, '/');
  const normalizedPath =
    collapsedPath.length > 1
      ? collapsedPath.replace(/\/+$/, '')
      : collapsedPath;
  return `${method}:${normalizedPath}`;
}

/**
 * @internal Exported for throttling tests.
 */
export function isPublicAuthThrottleRequest(
  request: AuthThrottleRequest,
): boolean {
  const signature = getRequestSignature(request);
  if (!signature) {
    return false;
  }

  return AUTH_THROTTLE_ROUTE_SIGNATURES.has(signature);
}

/**
 * @internal Exported for throttling tests.
 */
export const getAuthEmailThrottleTracker: ThrottlerGetTrackerFunction = (
  request: AuthThrottleRequest,
) => {
  const normalizedEmail = extractNormalizedEmail(request);
  if (normalizedEmail) {
    return `email:${normalizedEmail}`;
  }

  return `ip:${getRealClientIp(request)}`;
};

function shouldSkipAuthEmailThrottle(context: ExecutionContext): boolean {
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

/**
 * @internal Exported for throttling tests.
 *
 * Buckets a request-code call by its referral code so a single shared code can
 * only fan out a bounded number of verification emails per window regardless of
 * the (varying) target email. Falls back to the client IP for safety, though
 * the skip guard below means it only runs when a code is actually present.
 */
export const getAuthReferralThrottleTracker: ThrottlerGetTrackerFunction = (
  request: AuthThrottleRequest,
) => {
  const referralCode = extractNormalizedReferralCode(request);
  if (referralCode) {
    return `referral:${referralCode}`;
  }

  return `ip:${getRealClientIp(request)}`;
};

/**
 * @internal Exported for throttling tests.
 */
export function shouldSkipAuthReferralThrottle(
  context: ExecutionContext,
): boolean {
  const request = context.switchToHttp().getRequest<AuthThrottleRequest>();
  // Only the request-code route, and only when it carries a referral code, is
  // subject to the per-code cap. Every other route (register, login, reset) and
  // code-less request-code call is left to the email/IP buckets.
  if (getRequestSignature(request) !== REQUEST_CODE_ROUTE_SIGNATURE) {
    return true;
  }

  return extractNormalizedReferralCode(request) === null;
}

export const authReferralThrottler: ThrottlerOptions = {
  name: AUTH_REFERRAL_THROTTLER_NAME,
  ttl: AUTH_THROTTLE_TTL_MS,
  limit: Number.MAX_SAFE_INTEGER,
  skipIf: shouldSkipAuthReferralThrottle,
  getTracker: getAuthReferralThrottleTracker,
};

export function createPublicAuthThrottle(route: PublicAuthRouteKey) {
  const throttle = publicAuthRouteThrottles[route];

  return {
    default: {
      ttl: throttle.ttlMs,
      limit: throttle.ipLimit,
    },
    [AUTH_EMAIL_THROTTLER_NAME]: {
      ttl: throttle.emailTtlMs ?? throttle.ttlMs,
      limit: throttle.emailLimit,
      getTracker: getAuthEmailThrottleTracker,
    },
    // Per-referral-code bucket, only when the route declares a referralLimit
    // (request-code). The named throttler is registered globally and skips
    // itself everywhere else, so omitting it here leaves other routes untouched.
    ...(throttle.referralLimit !== undefined
      ? {
          [AUTH_REFERRAL_THROTTLER_NAME]: {
            ttl: throttle.ttlMs,
            limit: throttle.referralLimit,
            getTracker: getAuthReferralThrottleTracker,
          },
        }
      : {}),
  };
}

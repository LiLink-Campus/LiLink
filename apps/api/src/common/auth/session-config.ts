import type { CookieOptions } from 'express';
import type { JwtSignOptions } from '@nestjs/jwt';
import { env } from '../../config/env';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

type SessionConfig = {
  jwtExpiresIn: JwtSignOptions['expiresIn'];
  cookieMaxAgeMs: number;
};

function createSessionConfig(days: number): SessionConfig {
  return {
    jwtExpiresIn: `${days}d`,
    cookieMaxAgeMs: days * MILLISECONDS_PER_DAY,
  };
}

function createBaseCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.APP_ENV === 'production',
    domain: env.COOKIE_DOMAIN || undefined,
    path: '/',
  };
}

export const userSessionConfig = createSessionConfig(env.USER_SESSION_TTL_DAYS);
export const adminSessionConfig = createSessionConfig(
  env.ADMIN_SESSION_TTL_DAYS,
);

export function createSessionCookieOptions(maxAge: number): CookieOptions {
  return {
    ...createBaseCookieOptions(),
    maxAge,
  };
}

export function createSessionClearCookieOptions(): CookieOptions {
  return createBaseCookieOptions();
}

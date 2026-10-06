import { env } from '../config/env';

/** Canonicalize only the formal Web entry; preserve all other URL components. */
export function canonicalPublicWebUrl(value: string): string {
  const url = new URL(value);
  if (url.origin === 'https://lilink.top') url.hostname = 'www.lilink.top';
  return url.href;
}

export function publicWebOrigin(): string {
  return new URL(
    canonicalPublicWebUrl(env.PUBLIC_WEB_URL || env.CLIENT_ORIGIN[0]),
  ).origin;
}

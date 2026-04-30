import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiBaseUrl } from "./api-base-url";
import {
  LOCALE_COOKIE_NAME,
  normalizeLocale,
  type SupportedLocale,
} from "@lilink/shared";

const USER_COOKIE_NAME = process.env.COOKIE_NAME?.trim() || "lilink_token";
const ADMIN_COOKIE_NAME =
  process.env.ADMIN_COOKIE_NAME?.trim() || "lilink_admin_token";

type ServerFetchOptions = RequestInit & {
  cookieNames?: string[];
  includeLocale?: boolean;
  locale?: SupportedLocale;
};

function isMissingRequestContextError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("Expected workStore to be initialized")
  );
}

function parseFailedResponseBody(
  text: string,
  status: number,
  locale: ReturnType<typeof normalizeLocale>,
): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return locale === "en-US"
      ? `Request failed (${status})`
      : `请求失败（${status}）`;
  }

  try {
    const parsed = JSON.parse(trimmed) as { message?: unknown };
    if (typeof parsed.message === "string") {
      return parsed.message;
    }
    if (Array.isArray(parsed.message)) {
      const parts = parsed.message.filter(
        (item): item is string => typeof item === "string",
      );
      if (parts.length > 0) {
        return parts.join(locale === "en-US" ? "; " : "；");
      }
    }
  } catch {
    // Response is not JSON; show body as-is.
  }

  return trimmed;
}

async function readRequestLocale() {
  try {
    const cookieStore = await cookies();
    return normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  } catch (error) {
    // Build-time prerender paths do not have an incoming request to read from.
    if (isMissingRequestContextError(error)) {
      return normalizeLocale(null);
    }

    throw error;
  }
}

async function buildForwardedCookieHeader(cookieNames: string[]) {
  let cookieStore: Awaited<ReturnType<typeof cookies>>;
  try {
    cookieStore = await cookies();
  } catch (error) {
    // Build-time prerender paths should behave as unauthenticated requests.
    if (isMissingRequestContextError(error)) {
      return "";
    }

    throw error;
  }

  const forwardedCookies = cookieNames
    .map((name) => {
      const value = cookieStore.get(name)?.value;
      if (!value) {
        return null;
      }
      return `${name}=${value}`;
    })
    .filter((value): value is string => Boolean(value));

  return forwardedCookies.join("; ");
}

async function fetchApiServer<T>(
  path: string,
  options: ServerFetchOptions,
): Promise<T> {
  const {
    cookieNames = [],
    includeLocale,
    locale: explicitLocale,
    ...fetchOptions
  } = options;
  const locale = explicitLocale ?? (await readRequestLocale());
  const cookieHeader = await buildForwardedCookieHeader(cookieNames);
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...fetchOptions,
    headers: {
      Accept: "application/json",
      ...(fetchOptions.body ? { "Content-Type": "application/json" } : {}),
      ...(includeLocale ? { "x-locale": locale } : {}),
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(fetchOptions.headers ?? {}),
    },
    cache: fetchOptions.cache ?? "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(parseFailedResponseBody(body, response.status, locale));
  }

  return response.json() as Promise<T>;
}

export function hasUserSessionCookie() {
  return cookies()
    .then((cookieStore) => cookieStore.has(USER_COOKIE_NAME))
    .catch((error: unknown) => {
      if (isMissingRequestContextError(error)) {
        return false;
      }

      throw error;
    });
}

export function hasAdminSessionCookie() {
  return cookies()
    .then((cookieStore) => cookieStore.has(ADMIN_COOKIE_NAME))
    .catch((error: unknown) => {
      if (isMissingRequestContextError(error)) {
        return false;
      }

      throw error;
    });
}

export function fetchUserApiServer<T>(path: string, options: RequestInit = {}) {
  return fetchApiServer<T>(path, {
    ...options,
    cookieNames: [USER_COOKIE_NAME],
    includeLocale: true,
  });
}

export function fetchUserApiServerWithLocale<T>(
  path: string,
  locale: SupportedLocale,
  options: RequestInit = {},
) {
  return fetchApiServer<T>(path, {
    ...options,
    cookieNames: [USER_COOKIE_NAME],
    includeLocale: true,
    locale,
  });
}

export function fetchAdminApiServer<T>(
  path: string,
  options: RequestInit = {},
) {
  return fetchApiServer<T>(path, {
    ...options,
    cookieNames: [ADMIN_COOKIE_NAME],
  });
}

export async function requireUserSession<T>(
  load: () => Promise<T>,
  loginPath = "/login",
) {
  if (!(await hasUserSessionCookie())) {
    redirect(loginPath);
  }

  return load();
}

export async function redirectAuthenticatedUser(destination = "/dashboard") {
  if (!(await hasUserSessionCookie())) {
    return;
  }

  try {
    await fetchUserApiServer("/auth/me");
    redirect(destination);
  } catch {
    // Ignore stale session cookies and render the public page.
  }
}

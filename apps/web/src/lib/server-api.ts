import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiBaseUrl } from "./api-base-url";

const USER_COOKIE_NAME = process.env.COOKIE_NAME?.trim() || "lilink_token";
const ADMIN_COOKIE_NAME =
  process.env.ADMIN_COOKIE_NAME?.trim() || "lilink_admin_token";

type ServerFetchOptions = RequestInit & {
  cookieNames?: string[];
};

function parseFailedResponseBody(text: string, status: number): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return `请求失败（${status}）`;
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
        return parts.join("；");
      }
    }
  } catch {
    // Response is not JSON; show body as-is.
  }

  return trimmed;
}

async function buildForwardedCookieHeader(cookieNames: string[]) {
  const cookieStore = await cookies();
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
  const cookieHeader = await buildForwardedCookieHeader(
    options.cookieNames ?? [],
  );
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(options.headers ?? {}),
    },
    cache: options.cache ?? "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(parseFailedResponseBody(body, response.status));
  }

  return response.json() as Promise<T>;
}

export function hasUserSessionCookie() {
  return cookies().then((cookieStore) => cookieStore.has(USER_COOKIE_NAME));
}

export function hasAdminSessionCookie() {
  return cookies().then((cookieStore) => cookieStore.has(ADMIN_COOKIE_NAME));
}

export function fetchUserApiServer<T>(path: string, options: RequestInit = {}) {
  return fetchApiServer<T>(path, {
    ...options,
    cookieNames: [USER_COOKIE_NAME],
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

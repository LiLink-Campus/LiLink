import "server-only";

import { sanitizeSameOriginRelativePath } from "@lilink/shared";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerApiBaseUrl } from "./api-base-url";

export class ServerApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

const USER_COOKIE_NAME = process.env.COOKIE_NAME?.trim() || "lilink_token";
const ADMIN_COOKIE_NAME =
  process.env.ADMIN_COOKIE_NAME?.trim() || "lilink_admin_token";

type ServerFetchOptions = RequestInit & {
  cookieNames?: string[];
};

const RETRYABLE_READ_STATUSES = new Set([502, 503, 504, 520, 522, 523, 524]);

async function readServerResponse(url: string, options: RequestInit) {
  const attempts = (options.method ?? "GET").toUpperCase() === "GET" && !options.body ? 2 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), 4_000);
    try {
      const response = await fetch(url, {
        ...options,
        signal: options.signal ? AbortSignal.any([options.signal, deadline.signal]) : deadline.signal,
      });
      const headersReceived = performance.now();
      const body = await response.text();
      if (attempt + 1 < attempts && RETRYABLE_READ_STATUSES.has(response.status)) continue;
      return { response, headersReceived, body };
    } catch (error) {
      if (options.signal?.aborted) throw error;
      const networkFailure = error instanceof TypeError;
      if (attempt + 1 < attempts && (deadline.signal.aborted || networkFailure)) continue;
      if (deadline.signal.aborted) throw new ServerApiError("服务响应超时，请稍后重试。", 504);
      if (networkFailure) throw new ServerApiError("暂时无法连接服务，请稍后重试。", 503);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new ServerApiError("暂时无法连接服务，请稍后重试。", 503);
}

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
    [...(options.cookieNames ?? []), "lilink_release_access"],
  );
  const started = performance.now();
  const traceId = process.env.SERVER_API_TIMING_LOG_ENABLED === "true"
    ? crypto.randomUUID()
    : undefined;
  const { response, headersReceived, body } = await readServerResponse(`${await getServerApiBaseUrl()}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(options.headers ?? {}),
      ...(traceId ? { "x-lilink-trace-id": traceId } : {}),
    },
    cache: options.cache ?? "no-store",
  });
  if (traceId) {
    console.info(JSON.stringify({
      event: "server_api_timing",
      traceId,
      startedAt: new Date(performance.timeOrigin + started).toISOString(),
      path: path.split("?")[0],
      status: response.status,
      headersMs: Math.round(headersReceived - started),
      bodyMs: Math.round(performance.now() - headersReceived),
      totalMs: Math.round(performance.now() - started),
    }));
  }

  if (!response.ok) {
    throw new ServerApiError(parseFailedResponseBody(body, response.status), response.status);
  }

  // Nest returns an empty successful body for a missing optional questionnaire.
  return (body.trim() ? JSON.parse(body) : null) as T;
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

async function resolveForwardedSiteOrigin(): Promise<string | null> {
  const headerList = await headers();
  const hostHeader =
    headerList.get("x-forwarded-host") ?? headerList.get("host");
  const host = hostHeader?.split(",")[0]?.trim();
  if (!host) {
    return null;
  }

  const protoHeader = headerList
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const protocol =
    protoHeader?.toLowerCase() === "https" ? "https:" : "http:";

  try {
    return new URL(`${protocol}//${host}`).origin;
  } catch {
    return null;
  }
}

export async function redirectAuthenticatedUser(options?: {
  /** Raw `next` query string from the request URL (unsafe until sanitized). */
  nextCandidate?: string | null;
  fallbackDestination?: string;
}) {
  if (!(await hasUserSessionCookie())) {
    return;
  }

  try {
    await fetchUserApiServer("/auth/me");
  } catch {
    // Ignore stale session cookies and render the public page.
    return;
  }

  const fallbackDestination = options?.fallbackDestination ?? "/dashboard";
  let destination = fallbackDestination;
  const trimmedNext = options?.nextCandidate?.trim();
  if (trimmedNext) {
    const siteOrigin = await resolveForwardedSiteOrigin();
    if (siteOrigin) {
      const safeNext = sanitizeSameOriginRelativePath(trimmedNext, siteOrigin);
      if (safeNext) {
        destination = safeNext;
      }
    }
  }

  redirect(destination);
}

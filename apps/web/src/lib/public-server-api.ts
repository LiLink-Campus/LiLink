import "server-only";

import { LOCALE_COOKIE_NAME, normalizeLocale } from "@lilink/shared";
import { cookies } from "next/headers";
import { apiBaseUrl } from "./api-base-url";
import type { EligibleSchoolsPayload } from "./eligible-schools";
import type { LandingPayload } from "./landing-payload";

async function readRequestLocale() {
  const cookieStore = await cookies();
  return normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
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

export function resolveApiOriginForPreconnect(): string | null {
  try {
    return new URL(apiBaseUrl).origin;
  } catch {
    return null;
  }
}

export async function getLandingPayload() {
  const locale = await readRequestLocale();
  const response = await fetch(`${apiBaseUrl}/public/landing`, {
    headers: { Accept: "application/json", "x-locale": locale },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(parseFailedResponseBody(body, response.status, locale));
  }

  return response.json() as Promise<LandingPayload>;
}

export async function getEligibleSchools() {
  const locale = await readRequestLocale();
  const response = await fetch(`${apiBaseUrl}/public/schools`, {
    headers: { Accept: "application/json", "x-locale": locale },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(parseFailedResponseBody(body, response.status, locale));
  }

  return response.json() as Promise<EligibleSchoolsPayload>;
}

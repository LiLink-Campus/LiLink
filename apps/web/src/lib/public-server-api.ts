import "server-only";

import { DEFAULT_LOCALE, normalizeLocale } from "@lilink/shared";
import { apiBaseUrl } from "./api-base-url";
import type { EligibleSchoolsPayload } from "./eligible-schools";
import type { LandingPayload } from "./landing-payload";

const PUBLIC_SERVER_LOCALE = DEFAULT_LOCALE;

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

export async function getLandingPayload() {
  const locale = PUBLIC_SERVER_LOCALE;
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
  const locale = PUBLIC_SERVER_LOCALE;
  const response = await fetch(`${apiBaseUrl}/public/schools`, {
    headers: { Accept: "application/json", "x-locale": locale },
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(parseFailedResponseBody(body, response.status, locale));
  }

  return response.json() as Promise<EligibleSchoolsPayload>;
}

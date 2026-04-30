import "server-only";

import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  normalizeLocale,
  type SupportedLocale,
} from "@lilink/shared";

export type { SupportedLocale };
export { DEFAULT_LOCALE, LOCALE_COOKIE_NAME };

function isMissingRequestContextError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("Expected workStore to be initialized")
  );
}

export async function getRequestLocale() {
  try {
    const cookieStore = await cookies();
    return normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  } catch (error) {
    // Build-time prerender paths do not have an incoming request to read from.
    if (isMissingRequestContextError(error)) {
      return DEFAULT_LOCALE;
    }

    throw error;
  }
}

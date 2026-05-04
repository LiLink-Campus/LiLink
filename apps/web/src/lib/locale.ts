import "server-only";

import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  normalizeLocale,
  parseSupportedLocale,
  type SupportedLocale,
} from "@lilink/shared";
import { fetchUserApiServer, hasUserSessionCookie } from "./server-api";

export type { SupportedLocale };
export { DEFAULT_LOCALE, LOCALE_COOKIE_NAME };

type RequestLocaleSource = "cookie" | "user" | "default";

type RequestLocaleResult = {
  locale: SupportedLocale;
  source: RequestLocaleSource;
};

export async function getRequestLocale() {
  return (await getRequestLocaleResult()).locale;
}

export async function getRequestLocaleResult(): Promise<RequestLocaleResult> {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  const parsedCookieLocale = parseSupportedLocale(cookieLocale);

  if (parsedCookieLocale) {
    return {
      locale: parsedCookieLocale,
      source: "cookie",
    };
  }

  if (!(await hasUserSessionCookie())) {
    return {
      locale: DEFAULT_LOCALE,
      source: "default",
    };
  }

  try {
    const user = await fetchUserApiServer<{ preferredLocale?: unknown }>(
      "/auth/me",
    );
    return {
      locale: normalizeLocale(user.preferredLocale),
      source: "user",
    };
  } catch {
    return {
      locale: DEFAULT_LOCALE,
      source: "default",
    };
  }
}

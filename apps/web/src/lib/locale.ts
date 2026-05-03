import "server-only";

import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  isSupportedLocale,
  normalizeLocale,
  type SupportedLocale,
} from "@lilink/shared";
import { fetchUserApiServer, hasUserSessionCookie } from "./server-api";

export type { SupportedLocale };
export { DEFAULT_LOCALE, LOCALE_COOKIE_NAME };

export async function getRequestLocale() {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;

  if (isSupportedLocale(cookieLocale)) {
    return cookieLocale;
  }

  if (!(await hasUserSessionCookie())) {
    return DEFAULT_LOCALE;
  }

  try {
    const user = await fetchUserApiServer<{ preferredLocale?: unknown }>(
      "/auth/me",
    );
    return normalizeLocale(user.preferredLocale);
  } catch {
    return DEFAULT_LOCALE;
  }
}

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

export async function getRequestLocale() {
  const cookieStore = await cookies();
  return normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
}

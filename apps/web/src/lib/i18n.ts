import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  normalizeLocale,
  type SupportedLocale,
} from "@lilink/shared";

export type LocalizedText<T = string> = Record<SupportedLocale, T>;

export function textForLocale<T>(
  locale: SupportedLocale,
  text: LocalizedText<T>,
): T {
  return text[locale] ?? text[DEFAULT_LOCALE];
}

export function readClientLocale(): SupportedLocale {
  if (typeof document === "undefined") {
    return DEFAULT_LOCALE;
  }

  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE_NAME}=`));
  if (!cookie) {
    return DEFAULT_LOCALE;
  }

  return normalizeLocale(
    decodeURIComponent(cookie.split("=").slice(1).join("=")),
  );
}

export function localeHeader(): Record<string, string> {
  return { "x-locale": readClientLocale() };
}

export const SUPPORTED_LOCALES = ["zh-CN", "en-US"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "zh-CN";
export const LOCALE_COOKIE_NAME = "lilink_locale";

const SUPPORTED_LOCALE_BY_CANONICAL_NAME = new Map<string, SupportedLocale>(
  SUPPORTED_LOCALES.map((locale) => [toCanonicalLocale(locale), locale]),
);

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return (
    typeof value === "string" &&
    SUPPORTED_LOCALES.includes(value as SupportedLocale)
  );
}

export function normalizeLocale(value: unknown): SupportedLocale {
  return parseSupportedLocale(value) ?? DEFAULT_LOCALE;
}

export function parseSupportedLocale(value: unknown): SupportedLocale | null {
  if (typeof value !== "string") {
    return null;
  }

  return (
    SUPPORTED_LOCALE_BY_CANONICAL_NAME.get(toCanonicalLocale(value)) ?? null
  );
}

function toCanonicalLocale(value: string): string {
  try {
    return Intl.getCanonicalLocales(value)[0] ?? "";
  } catch (error) {
    if (error instanceof RangeError) {
      return "";
    }

    throw error;
  }
}

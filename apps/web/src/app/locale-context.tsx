"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from "@lilink/shared";
import { readClientLocale } from "../lib/i18n";

type LocaleContextValue = {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => Promise<void>;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);
const localeListeners = new Set<() => void>();
let localeOverride: SupportedLocale | null = null;

function subscribeLocale(listener: () => void) {
  localeListeners.add(listener);
  return () => {
    localeListeners.delete(listener);
  };
}

function readLocaleSnapshot() {
  return localeOverride ?? readClientLocale();
}

function emitLocaleChange() {
  for (const listener of localeListeners) {
    listener();
  }
}

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale: SupportedLocale;
}) {
  const serverLocale = useMemo(
    () => (isSupportedLocale(initialLocale) ? initialLocale : DEFAULT_LOCALE),
    [initialLocale],
  );
  const locale = useSyncExternalStore(
    subscribeLocale,
    readLocaleSnapshot,
    () => serverLocale,
  );

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
  }, [locale]);

  const setLocale = useCallback(async (nextLocale: SupportedLocale) => {
    if (!isSupportedLocale(nextLocale)) {
      throw new Error(`Unsupported locale: ${String(nextLocale)}`);
    }

    const response = await fetch("/api/locale", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: nextLocale }),
    });

    if (!response.ok) {
      throw new Error("Failed to update locale.");
    }

    localeOverride = nextLocale;
    document.documentElement.lang = nextLocale;
    document.documentElement.dataset.locale = nextLocale;
    emitLocaleChange();
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale }),
    [locale, setLocale],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used inside LocaleProvider");
  }

  return context;
}

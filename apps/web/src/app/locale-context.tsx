"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  type SupportedLocale,
} from "@lilink/shared";
import { useAuthSession } from "./auth-session";

type LocaleContextValue = {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => Promise<void>;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: React.ReactNode;
  initialLocale: SupportedLocale;
}) {
  const { user } = useAuthSession();
  const sessionLocale = user?.preferredLocale;
  const resolvedInitialLocale = isSupportedLocale(initialLocale)
    ? initialLocale
    : DEFAULT_LOCALE;
  const resolvedLocale = isSupportedLocale(sessionLocale)
    ? sessionLocale
    : resolvedInitialLocale;
  const [locale, setLocaleState] = useState<SupportedLocale>(
    resolvedLocale,
  );

  useEffect(() => {
    setLocaleState(resolvedLocale);
  }, [resolvedLocale]);

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

    setLocaleState(nextLocale);
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

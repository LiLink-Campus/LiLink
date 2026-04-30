"use client";

import { useEffect } from "react";
import type { AuthMePayload } from "../../../lib/api";
import { useAuthSession } from "../../auth-session";
import { useLocale } from "../../locale-context";

export function useDashboardSessionSeed(initialUser: AuthMePayload) {
  const { setUser } = useAuthSession();
  const { locale, setLocale } = useLocale();

  useEffect(() => {
    setUser(initialUser);
    if (initialUser.preferredLocale !== locale) {
      void setLocale(initialUser.preferredLocale);
    }
  }, [initialUser, locale, setLocale, setUser]);
}

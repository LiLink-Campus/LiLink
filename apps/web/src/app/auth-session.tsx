"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchAuthMeDeduped, type AuthMePayload } from "../lib/api";

const AUTH_SESSION_REFRESH_TTL_MS = 60_000;

type AuthSessionContextValue = {
  user: AuthMePayload | null;
  hydrated: boolean;
  setUser: (user: AuthMePayload | null) => void;
  refreshUser: () => Promise<void>;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export function AuthSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [user, setUserState] = useState<AuthMePayload | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);
  const lastRefreshAtRef = useRef(0);

  const onAdminPath = pathname.startsWith("/admin");
  const onDashboardPath = pathname.startsWith("/dashboard");

  const setUser = useCallback((nextUser: AuthMePayload | null) => {
    setUserState(nextUser);
    hydratedRef.current = true;
    setHydrated(true);
    lastRefreshAtRef.current = Date.now();
  }, []);

  const refreshUser = useCallback(async () => {
    const now = Date.now();
    if (
      hydratedRef.current &&
      now - lastRefreshAtRef.current < AUTH_SESSION_REFRESH_TTL_MS
    ) {
      return;
    }

    lastRefreshAtRef.current = now;
    try {
      const nextUser = await fetchAuthMeDeduped();
      setUserState(nextUser);
    } finally {
      hydratedRef.current = true;
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (onAdminPath || onDashboardPath) {
      hydratedRef.current = true;
      setHydrated(true);
      return;
    }

    void refreshUser();
  }, [onAdminPath, onDashboardPath, pathname, refreshUser]);

  useEffect(() => {
    if (onAdminPath) {
      return;
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void refreshUser();
      }
    }

    function refreshOnFocus() {
      void refreshUser();
    }

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [onAdminPath, refreshUser]);

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      user,
      hydrated,
      setUser,
      refreshUser,
    }),
    [hydrated, refreshUser, setUser, user],
  );

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);
  if (!context) {
    throw new Error("useAuthSession must be used inside AuthSessionProvider");
  }

  return context;
}

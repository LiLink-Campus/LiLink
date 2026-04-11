"use client";

import { usePathname } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { fetchAuthMeDeduped, type AuthMePayload } from "../lib/api";

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
  const [user, setUser] = useState<AuthMePayload | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const onAdminPath = pathname.startsWith("/admin");

  async function refreshUser() {
    try {
      const nextUser = await fetchAuthMeDeduped();
      setUser(nextUser);
    } finally {
      setHydrated(true);
    }
  }

  useEffect(() => {
    if (onAdminPath) {
      setHydrated(true);
      return;
    }

    void refreshUser();
  }, [onAdminPath, pathname]);

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
  }, [onAdminPath, pathname]);

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      user,
      hydrated,
      setUser,
      refreshUser,
    }),
    [hydrated, user],
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

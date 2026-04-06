"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { fetchApi } from "../../lib/api";

export type AdminIdentity = {
  id: string;
  email: string;
  displayName: string | null;
};

type AdminContextValue = {
  admin: AdminIdentity | null;
  authenticated: boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  setError: (error: string | null) => void;
};

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin() {
  const context = useContext(AdminContext);

  if (!context) {
    throw new Error("useAdmin must be used inside AdminProvider");
  }

  return context;
}

export function AdminProvider({
  children,
  initialAdmin = null,
  skipInitialRefresh = false,
}: {
  children: React.ReactNode;
  initialAdmin?: AdminIdentity | null;
  skipInitialRefresh?: boolean;
}) {
  const [admin, setAdmin] = useState<AdminIdentity | null>(initialAdmin);
  const [authenticated, setAuthenticated] = useState(Boolean(initialAdmin));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshAuth() {
    setLoading(true);
    setError(null);

    try {
      const payload = await fetchApi<{ ok: true; admin: AdminIdentity }>("/admin-session/me");
      setAdmin(payload.admin);
      setAuthenticated(true);
    } catch {
      setAdmin(null);
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialAdmin || skipInitialRefresh) {
      return;
    }

    void refreshAuth();
  }, [initialAdmin, skipInitialRefresh]);

  async function login(email: string, password: string) {
    setLoading(true);
    setError(null);

    try {
      await fetchApi("/admin-session/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      await refreshAuth();
      return true;
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "认证失败");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    try {
      await fetchApi("/admin-session/logout", {
        method: "POST",
      });
    } finally {
      setAdmin(null);
      setAuthenticated(false);
    }
  }

  return (
    <AdminContext.Provider
      value={{
        admin,
        authenticated,
        loading,
        error,
        login,
        logout,
        refreshAuth,
        setError,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

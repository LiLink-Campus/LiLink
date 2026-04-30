"use client";

import { useEffect } from "react";
import type { AuthMePayload } from "../../../lib/api";
import { useAuthSession } from "../../auth-session";

export function useDashboardSessionSeed(initialUser: AuthMePayload) {
  const { setUser } = useAuthSession();

  useEffect(() => {
    setUser(initialUser);
  }, [initialUser, setUser]);
}

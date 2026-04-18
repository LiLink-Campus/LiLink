"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthSession } from "./auth-session";

export function AuthRedirectGate({
  children,
  destination = "/dashboard",
  blockUntilHydrated = false,
}: {
  children: React.ReactNode;
  destination?: string;
  blockUntilHydrated?: boolean;
}) {
  const router = useRouter();
  const { hydrated, user } = useAuthSession();

  useEffect(() => {
    if (!hydrated || !user) {
      return;
    }

    router.replace(destination);
  }, [destination, hydrated, router, user]);

  if (hydrated && user) {
    return null;
  }

  if (blockUntilHydrated && !hydrated) {
    return null;
  }

  return <>{children}</>;
}

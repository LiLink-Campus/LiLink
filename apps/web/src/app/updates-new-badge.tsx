"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useDevlogHasUnseen } from "@/lib/use-devlog-unseen";
import styles from "./site-nav.module.css";

/** Shows a small dot next to the 更新 nav item when devlog has unseen updates. */
export function UpdatesNewBadge() {
  const pathname = usePathname();
  const [latestPublishedAt, setLatestPublishedAt] = useState<string | null>(
    null,
  );
  const hasUnseen = useDevlogHasUnseen(latestPublishedAt);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // The /api/devlog/latest route is server-cached (revalidate 3600); a
        // client `cache: "no-store"` cannot defeat that, so rely on the shared
        // server cache instead of implying per-request freshness here.
        const res = await fetch("/api/devlog/latest");
        if (!res.ok || cancelled) return;
        const { latestPublishedAt: latest } = (await res.json()) as {
          latestPublishedAt: string | null;
        };
        if (!cancelled) {
          setLatestPublishedAt(latest);
        }
      } catch {
        // Non-critical enhancement — stay silent on failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasNew =
    !pathname.startsWith("/updates") && hasUnseen;

  if (!hasNew) return null;
  return <span className={styles.newDot} role="status" aria-label="有新更新" />;
}

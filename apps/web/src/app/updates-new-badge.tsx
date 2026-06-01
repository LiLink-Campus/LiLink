"use client";

import { useEffect, useState } from "react";
import { DEVLOG_LAST_SEEN_KEY } from "@/lib/devlog-constants";
import styles from "./site-nav.module.css";

/** Shows a small dot next to the 更新 nav item when devlog has unseen updates. */
export function UpdatesNewBadge() {
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/devlog/latest", { cache: "no-store" });
        if (!res.ok) return;
        const { latestPublishedAt } = (await res.json()) as {
          latestPublishedAt: string | null;
        };
        if (cancelled || !latestPublishedAt) return;
        const lastSeen = window.localStorage.getItem(DEVLOG_LAST_SEEN_KEY);
        if (!lastSeen || latestPublishedAt > lastSeen) {
          setHasNew(true);
        }
      } catch {
        // Non-critical enhancement — stay silent on failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!hasNew) return null;
  return <span className={styles.newDot} aria-label="有新更新" />;
}

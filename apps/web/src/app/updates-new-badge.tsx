"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  DEVLOG_LAST_SEEN_KEY,
  DEVLOG_LAST_SEEN_UPDATED_EVENT,
} from "@/lib/devlog-constants";
import {
  hasUnseenDevlogUpdates,
  readDevlogLastSeen,
} from "@/lib/devlog-seen-client";
import styles from "./site-nav.module.css";

/** Shows a small dot next to the 更新 nav item when devlog has unseen updates. */
export function UpdatesNewBadge() {
  const pathname = usePathname();
  const [latestPublishedAt, setLatestPublishedAt] = useState<string | null>(
    null,
  );
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/devlog/latest", { cache: "no-store" });
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

  useEffect(() => {
    function refresh() {
      if (pathname.startsWith("/updates")) {
        setHasNew(false);
        return;
      }
      setHasNew(
        hasUnseenDevlogUpdates(latestPublishedAt, readDevlogLastSeen()),
      );
    }

    refresh();

    function onStorage(event: StorageEvent) {
      if (event.key === DEVLOG_LAST_SEEN_KEY || event.key === null) {
        refresh();
      }
    }

    window.addEventListener(DEVLOG_LAST_SEEN_UPDATED_EVENT, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(DEVLOG_LAST_SEEN_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [pathname, latestPublishedAt]);

  if (!hasNew) return null;
  return <span className={styles.newDot} aria-label="有新更新" />;
}

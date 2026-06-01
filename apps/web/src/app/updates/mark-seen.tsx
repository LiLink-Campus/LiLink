"use client";

import { useEffect } from "react";
import { DEVLOG_LAST_SEEN_KEY } from "@/lib/devlog-constants";

/** On visiting the updates page, remember the newest date so the nav NEW dot clears. */
export function MarkUpdatesSeen({
  latestPublishedAt,
}: {
  latestPublishedAt: string | null;
}) {
  useEffect(() => {
    if (latestPublishedAt) {
      try {
        window.localStorage.setItem(DEVLOG_LAST_SEEN_KEY, latestPublishedAt);
      } catch {
        // Ignore storage failures (private mode etc.).
      }
    }
  }, [latestPublishedAt]);
  return null;
}

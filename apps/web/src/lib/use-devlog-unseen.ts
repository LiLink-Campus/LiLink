"use client";

import { useEffect, useState } from "react";
import {
  DEVLOG_LAST_SEEN_KEY,
  DEVLOG_LAST_SEEN_UPDATED_EVENT,
} from "./devlog-constants";
import {
  hasUnseenDevlogUpdates,
  readDevlogLastSeen,
} from "./devlog-seen-client";

/** Whether the visitor has not yet opened /updates since `latestPublishedAt`. */
export function useDevlogHasUnseen(latestPublishedAt: string | null): boolean {
  const [hasUnseen, setHasUnseen] = useState(false);

  useEffect(() => {
    function refresh() {
      setHasUnseen(
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
  }, [latestPublishedAt]);

  return hasUnseen;
}

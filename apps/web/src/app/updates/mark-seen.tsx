"use client";

import { useEffect } from "react";
import { writeDevlogLastSeen } from "@/lib/devlog-seen-client";

/** On visiting the updates page, remember the newest date so the nav NEW dot clears. */
export function MarkUpdatesSeen({
  latestPublishedAt,
}: {
  latestPublishedAt: string | null;
}) {
  useEffect(() => {
    if (latestPublishedAt) {
      writeDevlogLastSeen(latestPublishedAt);
    }
  }, [latestPublishedAt]);
  return null;
}

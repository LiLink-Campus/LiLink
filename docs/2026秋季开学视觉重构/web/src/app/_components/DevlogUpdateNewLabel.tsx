"use client";

import { useDevlogHasUnseen } from "@/lib/use-devlog-unseen";
import styles from "./recent-updates.module.css";

/** NEW pill on the latest homepage update card; clears after visiting /updates. */
export function DevlogUpdateNewLabel({
  latestPublishedAt,
}: {
  latestPublishedAt: string;
}) {
  const hasNew = useDevlogHasUnseen(latestPublishedAt);
  if (!hasNew) {
    return null;
  }

  return (
    <span className={styles.new} aria-hidden="true">
      NEW
    </span>
  );
}

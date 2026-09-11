"use client";

import { useEffect, useState } from "react";

const DEFAULT_TICK_MS = 30_000;

/**
 * Render-stable clock for dashboard client components.
 *
 * Returns `initialNowMs` (frozen on the server) for the server render and the
 * first client render so hydration matches, then advances to the real client
 * time after mount and ticks on an interval so time-sensitive copy stays fresh.
 * Time-dependent render helpers should consume this value instead of calling
 * `Date.now()` directly.
 */
export function useClientNow(
  initialNowMs: number,
  tickMs: number = DEFAULT_TICK_MS,
): number {
  const [nowMs, setNowMs] = useState(initialNowMs);

  useEffect(() => {
    setNowMs(Date.now());
    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, tickMs);
    return () => window.clearInterval(interval);
  }, [tickMs]);

  return nowMs;
}

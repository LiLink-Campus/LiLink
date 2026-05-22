"use client";

import { useEffect, useMemo, useState } from "react";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const TICK_INTERVAL_MS = 30_000;

type CountdownParts = {
  expired: boolean;
  days: number;
  hours: number;
  minutes: number;
};

function partsFor(targetMs: number, nowMs: number): CountdownParts {
  const remaining = targetMs - nowMs;
  if (remaining <= 0) {
    return { expired: true, days: 0, hours: 0, minutes: 0 };
  }
  const days = Math.floor(remaining / DAY_MS);
  const hours = Math.floor((remaining % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((remaining % HOUR_MS) / MINUTE_MS);
  return { expired: false, days, hours, minutes };
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Live countdown to a future ISO timestamp. Updates every 30s (sub-minute
 * precision isn't useful here and would burn battery on mobile). Falls back
 * to a static, non-ticking render under prefers-reduced-motion, and after
 * the target time passes.
 */
export function RevealCountdown({
  targetIso,
  expiredLabel = "已开始",
  prefix = "距",
}: {
  targetIso: string | null | undefined;
  expiredLabel?: string;
  prefix?: string;
}) {
  const targetMs = useMemo(() => {
    if (!targetIso) return null;
    const ms = new Date(targetIso).getTime();
    return Number.isNaN(ms) ? null : ms;
  }, [targetIso]);

  const [mounted, setMounted] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (targetMs === null) return;
    if (!mounted) return;

    const syncNow = () => {
      const nextNowMs = Date.now();
      setNowMs(nextNowMs);
      return nextNowMs >= targetMs;
    };

    if (syncNow() || prefersReducedMotion()) return;

    const interval = window.setInterval(() => {
      if (syncNow()) {
        window.clearInterval(interval);
      }
    }, TICK_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [mounted, targetMs]);

  if (targetMs === null) {
    return <span className="v2-countdown v2-countdown-static">暂无开放轮次</span>;
  }

  if (!mounted || nowMs === null) {
    return (
      <span className="v2-countdown v2-countdown-static" suppressHydrationWarning>
        计算中
      </span>
    );
  }

  const parts = partsFor(targetMs, nowMs);

  if (parts.expired) {
    return (
      <span className="v2-countdown v2-countdown-static">{expiredLabel}</span>
    );
  }

  return (
    <span className="v2-countdown" aria-label={`${prefix}揭晓`}>
      <span className="v2-countdown-num">{parts.days}</span>
      <span className="v2-countdown-unit">天</span>
      <span className="v2-countdown-num">{parts.hours}</span>
      <span className="v2-countdown-unit">时</span>
      <span className="v2-countdown-num">{parts.minutes}</span>
      <span className="v2-countdown-unit">分</span>
    </span>
  );
}

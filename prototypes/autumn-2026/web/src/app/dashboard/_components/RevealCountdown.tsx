"use client";

import { dcx } from "../_lib/dashboard-class-names";
import { useEffect, useMemo, useState } from "react";

const SECOND_MS = 1_000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MINUTE_TICK_MS = 30_000;

type CountdownParts = {
  expired: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

function pad2(value: number) {
  return value.toString().padStart(2, "0");
}

function partsFor(
  targetMs: number,
  nowMs: number,
  includeSeconds: boolean,
): CountdownParts {
  const remaining = targetMs - nowMs;
  if (remaining <= 0) {
    return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  if (includeSeconds) {
    const totalSec = Math.floor(remaining / SECOND_MS);
    return {
      expired: false,
      days: Math.floor(totalSec / 86400),
      hours: Math.floor((totalSec % 86400) / 3600),
      minutes: Math.floor((totalSec % 3600) / 60),
      seconds: totalSec % 60,
    };
  }

  return {
    expired: false,
    days: Math.floor(remaining / DAY_MS),
    hours: Math.floor((remaining % DAY_MS) / HOUR_MS),
    minutes: Math.floor((remaining % HOUR_MS) / MINUTE_MS),
    seconds: 0,
  };
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Live countdown to a future ISO timestamp. Defaults to minute precision with
 * 30s refresh; pass includeSeconds for a per-second ticker.
 */
export function RevealCountdown({
  targetIso,
  expiredLabel = "已开始",
  prefix = "距",
  includeSeconds = false,
  className,
}: {
  targetIso: string | null | undefined;
  expiredLabel?: string;
  prefix?: string;
  includeSeconds?: boolean;
  className?: string;
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

    const interval = window.setInterval(
      () => {
        if (syncNow()) {
          window.clearInterval(interval);
        }
      },
      includeSeconds ? SECOND_MS : MINUTE_TICK_MS,
    );
    return () => window.clearInterval(interval);
  }, [includeSeconds, mounted, targetMs]);

  if (targetMs === null) {
    return (
      <span className={className ?? dcx("v2-countdown v2-countdown-static")}>
        暂无开放轮次
      </span>
    );
  }

  if (!mounted || nowMs === null) {
    return (
      <span
        className={className ?? dcx("v2-countdown v2-countdown-static")}
        suppressHydrationWarning
      >
        计算中
      </span>
    );
  }

  const parts = partsFor(targetMs, nowMs, includeSeconds);

  if (parts.expired) {
    return (
      <span className={className ?? dcx("v2-countdown v2-countdown-static")}>
        {expiredLabel}
      </span>
    );
  }

  return (
    <span
      className={className ?? dcx("v2-countdown")}
      aria-live={includeSeconds ? "polite" : undefined}
      aria-label={`${prefix}揭晓`}
    >
      <span className={dcx("v2-countdown-num")}>{parts.days}</span>
      <span className={dcx("v2-countdown-unit")}>天</span>
      <span className={dcx("v2-countdown-num")}>
        {includeSeconds ? pad2(parts.hours) : parts.hours}
      </span>
      <span className={dcx("v2-countdown-unit")}>时</span>
      <span className={dcx("v2-countdown-num")}>
        {includeSeconds ? pad2(parts.minutes) : parts.minutes}
      </span>
      <span className={dcx("v2-countdown-unit")}>分</span>
      {includeSeconds ? (
        <>
          <span className={dcx("v2-countdown-num")}>{pad2(parts.seconds)}</span>
          <span className={dcx("v2-countdown-unit")}>秒</span>
        </>
      ) : null}
    </span>
  );
}

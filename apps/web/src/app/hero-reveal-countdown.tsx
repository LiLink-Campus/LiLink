"use client";

import { useSyncExternalStore } from "react";

type HeroRevealCountdownProps = {
  /** ISO timestamp for the next reveal; null means not configured */
  revealAt: string | null;
  /** When true, show offline message instead of countdown */
  offline: boolean;
  /** Matches server-rendered text before hydration tick starts */
  serverFallbackLabel: string;
};

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function formatRemainingParts(ms: number) {
  if (ms <= 0) return null;
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return { days, hours, minutes, seconds };
}

let currentClockSnapshot: number | null = null;

function subscribeToClock(onStoreChange: () => void) {
  currentClockSnapshot = Date.now();
  const id = window.setInterval(() => {
    currentClockSnapshot = Date.now();
    onStoreChange();
  }, 1000);
  return () => window.clearInterval(id);
}

function getClientNowMs() {
  if (currentClockSnapshot == null) {
    currentClockSnapshot = Date.now();
  }
  return currentClockSnapshot;
}

function getServerNowMs() {
  return null;
}

export function HeroRevealCountdown({
  revealAt,
  offline,
  serverFallbackLabel,
}: HeroRevealCountdownProps) {
  const nowMs = useSyncExternalStore(
    subscribeToClock,
    getClientNowMs,
    getServerNowMs,
  );

  if (offline) {
    return (
      <div className="hero-reveal-countdown hero-reveal-countdown--static">
        {serverFallbackLabel}
      </div>
    );
  }

  if (!revealAt) {
    return (
      <div className="hero-reveal-countdown hero-reveal-countdown--static">
        轮次时间待配置
      </div>
    );
  }

  const target = new Date(revealAt).getTime();
  const targetValid = !Number.isNaN(target);
  const remaining =
    nowMs != null && targetValid ? target - nowMs : null;
  const parts =
    remaining != null && !Number.isNaN(remaining)
      ? formatRemainingParts(remaining)
      : null;

  if (!targetValid || nowMs == null) {
    return (
      <div className="hero-reveal-countdown hero-reveal-countdown--static">
        {serverFallbackLabel}
      </div>
    );
  }

  if (parts == null) {
    return (
      <div className="hero-reveal-countdown hero-reveal-countdown--static">
        本期已揭晓
      </div>
    );
  }

  return (
    <div
      className="hero-reveal-countdown"
      aria-live="polite"
      aria-label="距离下次揭晓的剩余时间"
    >
      <span className="countdown-num">{parts.days}</span>
      <span className="countdown-unit">天</span>
      <span className="countdown-num">{pad2(parts.hours)}</span>
      <span className="countdown-unit">时</span>
      <span className="countdown-num">{pad2(parts.minutes)}</span>
      <span className="countdown-unit">分</span>
      <span className="countdown-num">{pad2(parts.seconds)}</span>
      <span className="countdown-unit">秒</span>
    </div>
  );
}

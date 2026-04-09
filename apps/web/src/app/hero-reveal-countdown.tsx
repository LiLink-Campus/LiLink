"use client";

import { useEffect, useState } from "react";

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

function formatRemaining(ms: number) {
  if (ms <= 0) {
    return null;
  }
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (days > 0) {
    return `${days}天 ${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  }
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

export function HeroRevealCountdown({
  revealAt,
  offline,
  serverFallbackLabel,
}: HeroRevealCountdownProps) {
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    setNowMs(Date.now());
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

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
  const line =
    remaining != null && !Number.isNaN(remaining)
      ? formatRemaining(remaining)
      : null;

  const display = !targetValid
    ? serverFallbackLabel
    : line != null
      ? line
      : nowMs == null
        ? serverFallbackLabel
        : "本期已揭晓";

  return (
    <div
      className="hero-reveal-countdown"
      aria-live="polite"
      aria-label="距离下次揭晓的剩余时间"
    >
      <span className="hero-reveal-countdown__value">{display}</span>
    </div>
  );
}

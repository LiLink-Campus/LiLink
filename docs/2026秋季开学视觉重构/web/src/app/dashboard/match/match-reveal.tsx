"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { hasSeenReveal, markRevealSeen } from "./reveal-receipt";
import Image from "next/image";
import styles from "./match-reveal.module.css";

type Phase = "checking" | "delivery" | "ready" | "opening" | "revealed";

export function MatchReveal({ children, enabled, receiptKey }: { children: ReactNode; enabled: boolean; receiptKey: string }) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [alreadySeen, setAlreadySeen] = useState(false);
  const result = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!enabled) return;
    if (phase === "checking") {
      const timer = window.setTimeout(() => {
        const seen = hasSeenReveal(receiptKey);
        setAlreadySeen(seen);
        setPhase(seen ? "revealed" : "delivery");
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (phase === "revealed") {
      markRevealSeen(receiptKey);
      if (!alreadySeen) result.current?.focus({ preventScroll: true });
      return;
    }
    if (phase === "ready") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setPhase(phase === "delivery" ? "ready" : "revealed"), reduced ? 0 : phase === "delivery" ? 2200 : 1800);
    return () => window.clearTimeout(timer);
  }, [phase, enabled, receiptKey, alreadySeen]);
  if (!enabled) return <>{children}</>;
  if (phase === "checking") return <div className={styles.scene} role="status">正在读取本轮匹配…</div>;
  if (phase === "revealed") return <div className={alreadySeen ? undefined : styles.result} ref={result} tabIndex={-1} aria-label="本轮匹配结果">{children}</div>;
  return <section className={styles.scene} data-phase={phase} aria-label="匹配揭晓">
    <div className={styles.copy}>
      <p>本轮来信</p>
      <h2>一份相遇，正在抵达</h2>
      <span role="status">{phase === "delivery" ? "鸽子正为你送来一封信…" : phase === "ready" ? "信已送达，点击信封查看。" : "正在展开这封来信…"}</span>
    </div>
    <div className={styles.stage}>
      <div className={styles.courier} aria-hidden="true"><Image src="/icons/icon.svg" alt="" width={150} height={150} unoptimized /></div>
      <button className={styles.envelope} aria-label="打开来信，查看本轮匹配" disabled={phase !== "ready"} onClick={() => setPhase("opening")}>
        <span className={styles.paper} aria-hidden="true"><span className={styles.paperTop}>LiLink</span><span className={styles.paperMessage}>很高兴<br />在这个秋天遇见你</span><span className={styles.paperFold} /></span>
        <span className={styles.pocket} aria-hidden="true" />
        <span className={styles.flap} aria-hidden="true" />
        <span className={styles.seal} aria-hidden="true">L</span>
      </button>
    </div>
  </section>;
}

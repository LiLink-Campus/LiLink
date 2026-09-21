"use client";

import { useEffect, useState } from "react";
import { CommunityCharts } from "./community-charts";
import styles from "./community-stats.module.css";

import type { CommunityStatsPayload } from "../lib/community-stats";

export type { CommunityStatsPayload } from "../lib/community-stats";

export function CommunityStats({ initialData = null }: { initialData?: CommunityStatsPayload | null }) {
  const [data, setData] = useState<CommunityStatsPayload | null>(initialData);
  useEffect(() => {
    let active = true;
    let pending = false;
    let controller: AbortController | null = null;
    async function refresh() {
      if (document.hidden || pending) return;
      pending = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 10000);
      try {
        const response = await fetch("/api/public/community", { cache: "default", signal: controller.signal });
        if (!response.ok) throw new Error("Unavailable");
        const next = await response.json() as CommunityStatsPayload;
        if (active) setData(next);
      } catch {
        // Keep the last successful snapshot; diagnostics belong in server logs.
      } finally {
        clearTimeout(timeout);
        pending = false;
      }
    }
    void refresh();
    const interval = setInterval(() => void refresh(), 30000);
    const resume = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", resume);
    return () => { active = false; controller?.abort(); clearInterval(interval); document.removeEventListener("visibilitychange", resume); };
  }, []);

  // Statistics are optional: a cold-cache outage must not become a page error.
  if (!data) return null;

  return <section className={styles.section} aria-labelledby="community-title">
    <header className={styles.header}><h2 id="community-title">在这里，遇见同学</h2><p>看看已有多少同学加入 LiLink</p></header>
    <CommunityCharts data={data} />
  </section>;
}

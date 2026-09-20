"use client";

import { useEffect, useState } from "react";
import { CommunityCharts } from "./community-charts";
import styles from "./community-stats.module.css";

export type CommunityStatsPayload = {
  total: number;
  genders: { male: number; female: number; nonBinary: number; unknown: number };
  schools: { id: string | null; name: string; count: number }[];
  generatedAt: string;
};

export function CommunityStats() {
  const [data, setData] = useState<CommunityStatsPayload | null>(null);
  const [failed, setFailed] = useState(false);
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
        const response = await fetch("/api/public/community", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Unavailable");
        const next = await response.json() as CommunityStatsPayload;
        if (active) { setData(next); setFailed(false); }
      } catch {
        if (active) setFailed(true);
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

  return <section className={styles.section} aria-labelledby="community-title">
    <header className={styles.header}><h2 id="community-title">在这里，遇见同学</h2><p>看看已有多少同学加入 LiLink</p></header>
    {(!data || failed) && <p className={styles.status} role="status">{failed ? (data ? "更新暂时失败，以下为上次成功统计" : "人数统计暂时不可用，稍后自动重试") : "正在加载人数统计…"}</p>}
    {data && <CommunityCharts data={data} />}
  </section>;
}

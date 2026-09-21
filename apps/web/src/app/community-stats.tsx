"use client";

import { useEffect, useState } from "react";
import { CommunityCharts } from "./community-charts";
import styles from "./community-stats.module.css";

import type { CommunityStatsPayload } from "../lib/community-stats";

export type { CommunityStatsPayload } from "../lib/community-stats";

export function CommunityStats({ initialData = null }: { initialData?: CommunityStatsPayload | null }) {
  const [data, setData] = useState<CommunityStatsPayload | null>(initialData);
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
        const response = await fetch("/api/public/community", { cache: "default", signal: controller.signal });
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
    {(!data || failed) && <p className={styles.status} role="status">{failed ? (data ? "更新暂时失败，以下为上次成功统计；每 30 秒自动重试" : "人数统计暂时不可用，每 30 秒自动重试") : "正在加载人数统计…"}</p>}
    {data && <CommunityCharts data={data} />}
  </section>;
}

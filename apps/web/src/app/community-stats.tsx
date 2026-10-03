"use client";

import { CommunityCharts } from "./community-charts";
import styles from "./community-stats.module.css";

import type { CommunityStatsPayload } from "../lib/community-stats";

export type { CommunityStatsPayload } from "../lib/community-stats";

export function CommunityStats({ initialData = null }: { initialData?: CommunityStatsPayload | null }) {
  const data = initialData;

  // Statistics are optional: a cold-cache outage must not become a page error.
  if (!data) return null;

  return <section className={styles.section} aria-labelledby="community-title">
    <header className={styles.header}><h2 id="community-title">在这里，遇见同学</h2><p>看看已有多少同学加入 LiLink</p></header>
    <CommunityCharts data={data} />
  </section>;
}

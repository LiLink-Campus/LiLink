"use client";

import { useEffect, useState } from "react";
import type { CommunityStatsPayload } from "./community-stats";
import styles from "./community-stats.module.css";

const genders = [
  { key: "male", label: "男", color: "#74858f" },
  { key: "female", label: "女", color: "#9b4c65" },
  { key: "nonBinary", label: "非二元", color: "#b59d68" },
  { key: "unknown", label: "未填写", color: "#c7c2bb" },
] as const;

export function CommunityCharts({ data }: { data: CommunityStatsPayload }) {
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 40);
    return () => clearTimeout(timer);
  }, []);
  const slices = genders.map((item, index) => {
    const count = data.genders[item.key];
    const share = data.total > 0 ? count / data.total * 100 : 0;
    const start = data.total > 0 ? genders.slice(0, index).reduce((sum, gender) => sum + data.genders[gender.key], 0) / data.total * 100 : 0;
    return { ...item, count, share, start };
  });
  const selected = slices.find(item => item.key === active);
  const maximum = Math.max(1, ...data.schools.map(item => item.count));

  return <div className={styles.charts}>
    <section className={styles.genderPanel} aria-labelledby="gender-chart-title">
      <div className={styles.chartHeading}><h3 id="gender-chart-title">性别比例</h3><span>占全部加入人数</span></div>
      <div className={styles.donutWrap}>
        <svg viewBox="0 0 240 240" className={styles.donut} role="img" aria-label={slices.map(item => `${item.label} ${item.count} 人，占 ${item.share.toFixed(1)}%`).join("；")}>
          <circle cx="120" cy="120" r="92" fill="none" stroke="#eae5df" strokeWidth="30" />
          {slices.map(item => <circle key={item.key} cx="120" cy="120" r="92" fill="none" stroke={item.color} strokeWidth={active === item.key ? 36 : 30} pathLength="100" strokeDasharray={`${ready ? item.share : 0} ${100 - (ready ? item.share : 0)}`} strokeDashoffset={-item.start} className={styles.slice} style={{ opacity: active && active !== item.key ? 0.35 : 1 }} onPointerEnter={() => setActive(item.key)} onPointerLeave={() => setActive(null)}><title>{item.label} · {item.count} 人 · {item.share.toFixed(1)}%</title></circle>)}
        </svg>
        <div className={styles.donutCenter}><strong>{selected ? selected.count : data.total}</strong><span>{selected ? `${selected.label} · ${selected.share.toFixed(1)}%` : "位同学已加入"}</span></div>
      </div>
      <ul className={styles.legend} aria-label="性别人数与比例">
        {slices.map(item => <li key={item.key}><button type="button" aria-pressed={active === item.key} onClick={() => setActive(item.key)} onFocus={() => setActive(item.key)} onBlur={() => setActive(null)} onPointerEnter={() => setActive(item.key)} onPointerLeave={() => setActive(null)}><span className={styles.legendName}><i style={{ background: item.color }} />{item.label}</span><span>{item.count}<small> 人</small></span><span className={styles.percent}>{item.share.toFixed(1)}%</span></button></li>)}
      </ul>
      {data.total === 0 && <p className={styles.empty}>暂无同学加入</p>}
    </section>
    <section className={styles.schoolPanel} aria-labelledby="school-chart-title">
      <div className={styles.chartHeading}><h3 id="school-chart-title">同学来自这些学校</h3><span>已加入 {data.total} 人</span></div>
      {data.schools.length ? <>
        <ol className={styles.bars} aria-label="各学校已加入人数">
          {data.schools.map((school, index) => <li key={school.id ?? "none"}>
            <div className={styles.barLabel}><span><small>{String(index + 1).padStart(2, "0")}</small>{school.name}</span><strong>{school.count}<small> 人</small></strong></div>
            <div className={styles.barTrack} aria-hidden="true"><div className={styles.barFill} style={{ width: `${ready ? school.count / maximum * 100 : 0}%` }} /></div>
          </li>)}
        </ol>
      </> : <p className={styles.empty}>暂无学校人数数据</p>}
    </section>
  </div>;
}

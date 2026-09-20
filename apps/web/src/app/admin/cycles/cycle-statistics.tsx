"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";
import type { AdminCycleDetail } from "../types";
import type { SchoolsGenderResponse, WeeklyOptinResponse } from "../analytics/types";
import styles from "./cycles.module.css";

const SchoolsGenderChart = dynamic(() => import("../analytics/SchoolsGenderChart"), { ssr: false });
const WeeklyOptinChart = dynamic(() => import("../analytics/WeeklyOptinChart"), { ssr: false });

export default function CycleStatistics({
  cycleId,
  refreshKey,
  summary,
}: {
  cycleId: string;
  refreshKey: number;
  summary: AdminCycleDetail["summary"] | null;
}) {
  const [schools, setSchools] = useState<SchoolsGenderResponse | null>(null);
  const [weekly, setWeekly] = useState<WeeklyOptinResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSchools(null);
    setWeekly(null);
    void Promise.all([
      fetchApi<SchoolsGenderResponse>(
        `/admin/analytics/schools-gender?${new URLSearchParams({ cycleId, includeTest: "true" })}`,
        { signal: controller.signal }
      ),
      fetchApi<WeeklyOptinResponse>("/admin/analytics/weekly-optin?limit=8&includeTest=true", {
        signal: controller.signal,
      }),
    ])
      .then(([schoolData, weeklyData]) => {
        if (!controller.signal.aborted) {
          setSchools(schoolData);
          setWeekly(weeklyData);
        }
      })
      .catch((caught) => {
        if (!controller.signal.aborted)
          setError(caught instanceof Error ? caught.message : "图表加载失败。");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [cycleId, refreshKey, retry]);

  const total = schools?.totals.total ?? 0;
  const submitted = schools?.totals.submitted ?? 0;
  const missing = Math.max(0, total - submitted);
  const ratio = total > 0 ? Math.round((submitted / total) * 100) : null;
  if (error)
    return (
      <div className={styles.chartError}>
        <p role="alert">{error}</p>
        <button
          className="ui-button ui-button--secondary"
          type="button"
          onClick={() => setRetry((value) => value + 1)}
        >
          重试图表
        </button>
      </div>
    );

  return (
    <>
      <p className={styles.scopeNote}>统计已报名并选择意图的正常账号，含测试账号。</p>
      <div className={styles.charts} aria-busy={loading}>
        <section className={styles.completion} aria-label="问卷完成度">
          <h3>本轮问卷完成度</h3>
          <p>已报名 {loading ? "…" : total} 人</p>
          {loading ? (
            <div className={styles.chartLoading}>正在加载完成度…</div>
          ) : (
            <>
              <svg
                viewBox="0 0 160 160"
                role="img"
                aria-label={
                  total
                    ? `问卷完成率 ${ratio}%，已提交 ${submitted} 人，未提交 ${missing} 人`
                    : "本轮暂无报名"
                }
              >
                <circle
                  cx="80"
                  cy="80"
                  r="60"
                  fill="none"
                  stroke="var(--color-border)"
                  strokeWidth="12"
                />
                <circle
                  cx="80"
                  cy="80"
                  r="60"
                  fill="none"
                  stroke="var(--color-brand)"
                  opacity={ratio ? 1 : 0}
                  strokeWidth="12"
                  pathLength="100"
                  strokeDasharray={`${ratio ?? 0} 100`}
                  transform="rotate(-90 80 80)"
                  strokeLinecap="round"
                />
                <text
                  x="80"
                  y="80"
                  textAnchor="middle"
                  dominantBaseline="central"
                  className={styles.ringNumber}
                >
                  {ratio == null ? "—" : `${ratio}%`}
                </text>
                <text x="80" y="105" textAnchor="middle" className={styles.ringLabel}>
                  {total ? "已完成问卷" : "暂无报名"}
                </text>
              </svg>
              <div className={styles.completionLegend}>
                <span>
                  <i />
                  已提交 <strong>{submitted}</strong>
                </span>
                <span>
                  <i />
                  未提交 <strong>{missing}</strong>
                </span>
              </div>
            </>
          )}
          {summary && (
            <p className={styles.matchSummary}>
              正式匹配 <strong>{summary.matchedPairCount}</strong> 组 · 待联系{" "}
              <strong>{summary.pendingContactCount}</strong> 组
            </p>
          )}
        </section>
        <SchoolsGenderChart data={schools} loading={loading} />
        <div className={styles.trend}>
          <WeeklyOptinChart data={weekly} loading={loading} />
        </div>
      </div>
    </>
  );
}

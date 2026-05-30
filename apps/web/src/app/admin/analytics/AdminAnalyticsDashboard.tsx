"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { fetchApi } from "../../../lib/api";
import { cx } from "../admin-class-names";
import commonStyles from "../admin-common.module.css";
import { AdminRefreshButton } from "../merchant-admin-ui";
import styles from "./admin-analytics.module.css";
import FunnelPanel from "./FunnelPanel";
import KpiStrip from "./KpiStrip";
import MatchLeaderboardTable from "./MatchLeaderboardTable";
import {
  SAMPLE_COUPON_FUNNEL,
  SAMPLE_KPI_TILES,
  SAMPLE_MEETUP_FUNNEL,
} from "./placeholders";
import type {
  MatchLeaderboardResponse,
  SchoolsGenderResponse,
  WeeklyOptinResponse,
} from "./types";

const adminStyles = [commonStyles, styles];

const TIME_RANGES = [
  { key: "7d", label: "近 7 天" },
  { key: "30d", label: "近 30 天" },
  { key: "90d", label: "近 90 天" },
] as const;

type TimeRangeKey = (typeof TIME_RANGES)[number]["key"];

// recharts (and its d3 deps) is the heaviest dependency in the app and is only
// used on this admin route, so load it lazily on the client instead of bundling
// it into the route's initial chunk.
const ChartPanelFallback = () => (
  <section className={cx(adminStyles, "analytics-panel")} aria-busy="true" />
);

const SchoolsGenderChart = dynamic(() => import("./SchoolsGenderChart"), {
  ssr: false,
  loading: ChartPanelFallback,
});
const WeeklyOptinChart = dynamic(() => import("./WeeklyOptinChart"), {
  ssr: false,
  loading: ChartPanelFallback,
});

export default function AdminAnalyticsDashboard() {
  const [includeTest, setIncludeTest] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRangeKey>("7d");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [schoolsGender, setSchoolsGender] =
    useState<SchoolsGenderResponse | null>(null);
  const [weeklyOptin, setWeeklyOptin] = useState<WeeklyOptinResponse | null>(
    null,
  );
  const [leaderboard, setLeaderboard] =
    useState<MatchLeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      const sharedParams = new URLSearchParams();
      if (includeTest) sharedParams.set("includeTest", "true");
      const sharedQuery =
        sharedParams.size > 0 ? `?${sharedParams.toString()}` : "";
      const weeklyOptinParams = new URLSearchParams(sharedParams);
      weeklyOptinParams.set("limit", "8");
      const weeklyOptinQuery = `?${weeklyOptinParams.toString()}`;

      try {
        const [schoolsGenderData, weeklyOptinData, leaderboardData] =
          await Promise.all([
            fetchApi<SchoolsGenderResponse>(
              `/admin/analytics/schools-gender${sharedQuery}`,
              { signal },
            ),
            fetchApi<WeeklyOptinResponse>(
              `/admin/analytics/weekly-optin${weeklyOptinQuery}`,
              { signal },
            ),
            fetchApi<MatchLeaderboardResponse>(
              `/admin/analytics/match-leaderboard${sharedQuery}`,
              { signal },
            ),
          ]);

        if (signal.aborted) return;
        setSchoolsGender(schoolsGenderData);
        setWeeklyOptin(weeklyOptinData);
        setLeaderboard(leaderboardData);
      } catch (caught) {
        if (signal.aborted) return;
        setError(
          caught instanceof Error ? caught.message : "数据分析加载失败。",
        );
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [includeTest],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reloadNonce]);

  return (
    <div className={cx(adminStyles, "ops-container")}>
      <div className={cx(adminStyles, "ops-header")}>
        <div>
          <h1>数据分析</h1>
          <p className={cx(adminStyles, "ops-header-desc")}>
            产品行为漏斗与运营实况一屏概览。
          </p>
        </div>
        <div className={cx(adminStyles, "ops-header-actions")}>
          <label className={cx(adminStyles, "analytics-toggle")}>
            <input
              type="checkbox"
              checked={includeTest}
              onChange={(event) => setIncludeTest(event.target.checked)}
            />
            <span>含测试账号</span>
          </label>
          <AdminRefreshButton
            onClick={() => setReloadNonce((value) => value + 1)}
            disabled={loading}
          />
        </div>
      </div>

      {error ? (
        <p className="ui-form-message ui-form-message--error">{error}</p>
      ) : null}

      <section className={cx(adminStyles, "analytics-section")}>
        <div className={cx(adminStyles, "analytics-section-head")}>
          <div className={cx(adminStyles, "analytics-section-title")}>
            <h2>产品行为分析</h2>
            <span className={cx(adminStyles, "analytics-sample-badge")}>
              示例数据 · 待接入埋点后端
            </span>
          </div>
          <div
            className={cx(adminStyles, "admin-tabs analytics-range-tabs")}
            role="group"
            aria-label="时间范围"
          >
            {TIME_RANGES.map((range) => (
              <button
                key={range.key}
                type="button"
                className={
                  timeRange === range.key
                    ? "ui-segmented-item active"
                    : "ui-segmented-item"
                }
                onClick={() => setTimeRange(range.key)}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        <KpiStrip tiles={SAMPLE_KPI_TILES} />

        <div className={cx(adminStyles, "analytics-grid-2")}>
          <FunnelPanel
            title="优惠券漏斗"
            description="从优惠券页曝光到完成兑换的转化（intent → outcome）。"
            steps={SAMPLE_COUPON_FUNNEL}
          />
          <FunnelPanel
            title="约见漏斗"
            description="从约见入口到最终确认的转化（intent → outcome）。"
            steps={SAMPLE_MEETUP_FUNNEL}
          />
        </div>
      </section>

      <section className={cx(adminStyles, "analytics-section")}>
        <div className={cx(adminStyles, "analytics-section-head")}>
          <div className={cx(adminStyles, "analytics-section-title")}>
            <h2>运营实况</h2>
            <span className={cx(adminStyles, "analytics-live-badge")}>
              实时数据
            </span>
          </div>
        </div>

        <div className={cx(adminStyles, "analytics-grid-2")}>
          <SchoolsGenderChart data={schoolsGender} loading={loading} />
          <WeeklyOptinChart data={weeklyOptin} loading={loading} />
        </div>

        <MatchLeaderboardTable
          data={leaderboard}
          loading={loading}
          includeTest={includeTest}
        />
      </section>
    </div>
  );
}

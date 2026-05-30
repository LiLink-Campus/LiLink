"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { fetchApi } from "../../../lib/api";
import { cx } from "../admin-class-names";
import commonStyles from "../admin-common.module.css";
import { AdminRefreshButton } from "../merchant-admin-ui";
import styles from "./admin-analytics.module.css";
import FunnelPanel from "./FunnelPanel";
import KpiStrip, { type KpiTile } from "./KpiStrip";
import MatchLeaderboardTable from "./MatchLeaderboardTable";
import type {
  MatchLeaderboardResponse,
  ProductAnalyticsMissing,
  ProductAnalyticsResponse,
  SchoolsGenderResponse,
  WeeklyOptinResponse,
} from "./types";

const adminStyles = [commonStyles, styles];

const TIME_RANGES = [
  { key: "7d", label: "近 7 天" },
  { key: "30d", label: "近 30 天" },
  { key: "60d", label: "近 60 天" },
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

const formatInteger = new Intl.NumberFormat("zh-CN");

function formatRate(value: number | null) {
  if (value === null) return "暂无";
  return `${(value * 100).toFixed(1)}%`;
}

function buildProductKpiTiles(
  data: ProductAnalyticsResponse,
  rangeLabel: string,
): KpiTile[] {
  return [
    {
      key: "activeUsers",
      label: `活跃用户 · ${rangeLabel}`,
      value: formatInteger.format(data.kpis.activeUsers),
      hint: "ProductEvent 用户去重",
    },
    {
      key: "couponRate",
      label: "优惠券兑换率",
      value: formatRate(data.kpis.couponRedeemRate),
      hint:
        data.kpis.couponRedeemRate === null
          ? "缺少优惠券页浏览"
          : "完成兑换 / 优惠券页浏览",
    },
    {
      key: "meetupRate",
      label: "约见完成率",
      value: formatRate(data.kpis.meetupCompletionRate),
      hint:
        data.kpis.meetupCompletionRate === null
          ? "缺少约见入口点击"
          : "最终确认 / 约见入口点击",
    },
    {
      key: "events",
      label: `事件总数 · ${rangeLabel}`,
      value: formatInteger.format(data.kpis.totalEvents),
      hint: "footprint + intent + outcome",
    },
    {
      key: "todayEvents",
      label: "今日新增事件",
      value: `+${formatInteger.format(data.kpis.todayEvents)}`,
    },
    {
      key: "optinRate",
      label: "报名转化率",
      value: "未接入",
      hint: "缺少报名漏斗埋点",
    },
  ];
}

function ProductAnalyticsGaps({
  missing,
}: {
  missing: ProductAnalyticsMissing[];
}) {
  if (missing.length === 0) return null;

  return (
    <section className={cx(adminStyles, "analytics-panel")}>
      <div className={cx(adminStyles, "analytics-panel-head")}>
        <h2>尚未接入</h2>
        <p>这些指标还不能从现有 ProductEvent 可靠计算。</p>
      </div>
      <ul className={cx(adminStyles, "analytics-gap-list")}>
        {missing.map((item) => (
          <li key={item.key} className={cx(adminStyles, "analytics-gap-item")}>
            <strong>{item.label}</strong>
            <span>{item.reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function AdminAnalyticsDashboard() {
  const [includeTest, setIncludeTest] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRangeKey>("7d");
  const [reloadNonce, setReloadNonce] = useState(0);
  const [productAnalytics, setProductAnalytics] =
    useState<ProductAnalyticsResponse | null>(null);
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
      setProductAnalytics(null);
      const sharedParams = new URLSearchParams();
      if (includeTest) sharedParams.set("includeTest", "true");
      const sharedQuery =
        sharedParams.size > 0 ? `?${sharedParams.toString()}` : "";
      const weeklyOptinParams = new URLSearchParams(sharedParams);
      weeklyOptinParams.set("limit", "8");
      const weeklyOptinQuery = `?${weeklyOptinParams.toString()}`;
      const productParams = new URLSearchParams(sharedParams);
      productParams.set("range", timeRange);
      const productQuery = `?${productParams.toString()}`;

      try {
        const [
          productAnalyticsData,
          schoolsGenderData,
          weeklyOptinData,
          leaderboardData,
        ] = await Promise.all([
          fetchApi<ProductAnalyticsResponse>(
            `/admin/analytics/product-funnels${productQuery}`,
            { signal },
          ),
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
        setProductAnalytics(productAnalyticsData);
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
    [includeTest, timeRange],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reloadNonce]);

  const selectedRange =
    TIME_RANGES.find((range) => range.key === timeRange) ?? TIME_RANGES[0];
  const visibleProductAnalytics =
    productAnalytics?.range === timeRange &&
    productAnalytics.includeTest === includeTest
      ? productAnalytics
      : null;
  const productKpiTiles = visibleProductAnalytics
    ? buildProductKpiTiles(visibleProductAnalytics, selectedRange.label)
    : null;

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
            <span className={cx(adminStyles, "analytics-live-badge")}>
              实时数据
            </span>
            {visibleProductAnalytics?.missing.length ? (
              <span className={cx(adminStyles, "analytics-warning-badge")}>
                部分未接入
              </span>
            ) : null}
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

        {productKpiTiles ? (
          <KpiStrip tiles={productKpiTiles} />
        ) : (
          <div className={cx(adminStyles, "analytics-placeholder")}>
            产品行为数据加载中
          </div>
        )}

        <div className={cx(adminStyles, "analytics-grid-2")}>
          {visibleProductAnalytics?.funnels.map((funnel) => (
            <FunnelPanel
              key={funnel.key}
              title={funnel.title}
              description={funnel.description}
              steps={funnel.steps}
            />
          ))}
          {visibleProductAnalytics ? (
            <ProductAnalyticsGaps missing={visibleProductAnalytics.missing} />
          ) : null}
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

"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MEDIUM_LABELS, SCENE_LABELS, type ReferralMedium } from "@lilink/shared";
import { fetchApi } from "../../../lib/api";
import { cx } from "../admin-class-names";
import { AdminPagination } from "../admin-pagination";
import commonStyles from "../admin-common.module.css";
import cardStyles from "../admin-card.module.css";
import {
  AdminRefreshButton,
  CAMPAIGN_STATUS_LABELS,
} from "../merchant-admin-ui";
import merchantStyles from "../merchant-admin.module.css";
import type {
  AdminCampaign,
  PaginatedResult,
  PromotionChannelBreakdownRow,
  PromotionCouponsRow,
  PromotionFunnel,
  PromotionLeaderboardRow,
  PromotionRedemptionRow,
} from "../types";

const adminStyles = [commonStyles, cardStyles, merchantStyles];

const PAGE_SIZE = 20;

type DashboardTab = "overview" | "leaderboard" | "coupons";

const STEP_LABELS: Record<string, string> = {
  SHARE: "分享",
  CLICK: "点击",
  REGISTER: "注册",
  ACTIVATE: "激活",
  GRANT: "领券",
  REDEEM: "核销",
};

const GENDER_LABELS: Record<string, string> = {
  male: "男",
  female: "女",
  nonBinary: "非二元",
  unknown: "未知",
  男: "男",
  女: "女",
  非二元: "非二元",
};

const DATE_PRESETS = [
  { label: "近 7 天", days: 7 },
  { label: "近 30 天", days: 30 },
  { label: "近 90 天", days: 90 },
] as const;

const DASHBOARD_TABS: { key: DashboardTab; label: string }[] = [
  { key: "overview", label: "概览" },
  { key: "leaderboard", label: "排行榜" },
  { key: "coupons", label: "券与对账" },
];

const PEOPLE_METRIC_HINT =
  "归属用户转化与排行榜中的「核销」统计去重人数；券情况与核销对账统计核销单数与面值。";

const REACH_STEP_KEYS = ["SHARE", "CLICK"] as const;
const COHORT_STEP_KEYS = ["REGISTER", "ACTIVATE", "GRANT", "REDEEM"] as const;

function isoDay(offsetDays: number) {
  return new Date(Date.now() + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function yuan(cents: number) {
  return `${(cents / 100).toFixed(2)} 元`;
}

function emptyPage<T>(): PaginatedResult<T> {
  return { items: [], total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 1 };
}

function stepCount(funnel: PromotionFunnel, key: string) {
  return funnel.steps.find((step) => step.key === key)?.count ?? 0;
}

function presetMatches(from: string, to: string, days: number) {
  return from === isoDay(-(days - 1)) && to === isoDay(0);
}

function pickDefaultCampaign(campaigns: AdminCampaign[]) {
  const preferred =
    campaigns.find(
      (campaign) => campaign.status === "ACTIVE" && campaign.isDefault,
    ) ??
    campaigns.find((campaign) => campaign.status === "ACTIVE") ??
    campaigns[0];
  return preferred?.id ?? "";
}

function pctRate(numerator: number, denominator: number) {
  if (denominator <= 0) return "—";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function GenderBar({
  g,
}: {
  g: { male: number; female: number; nonBinary: number; unknown: number };
}) {
  const total = g.male + g.female + g.nonBinary + g.unknown;
  if (total === 0) {
    return <span className={cx(adminStyles, "mp-gender-empty")}>—</span>;
  }

  const segments = [
    { className: "is-male", count: g.male, label: "男" },
    { className: "is-female", count: g.female, label: "女" },
    { className: "is-nonbinary", count: g.nonBinary, label: "非二元" },
    { className: "is-unknown", count: g.unknown, label: "未知" },
  ].filter((segment) => segment.count > 0);

  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;

  return (
    <div className={cx(adminStyles, "mp-gender-cell")}>
      <div
        className={cx(adminStyles, "qb-genderbar")}
        title={segments
          .map((segment) => `${segment.label} ${segment.count}`)
          .join(" · ")}
      >
        {segments.map((segment) => (
          <span
            key={segment.className}
            className={cx(adminStyles, "qb-genderbar-seg", segment.className)}
            style={{ width: pct(segment.count) }}
          />
        ))}
      </div>
      <span className={cx(adminStyles, "mp-gender-counts")}>
        {segments.map((segment) => `${segment.label} ${segment.count}`).join(" · ")}
      </span>
    </div>
  );
}

function GenderLegend() {
  return (
    <div className={cx(adminStyles, "qb-legend ic-gender-legend")}>
      <span className={cx(adminStyles, "qb-legend-item")}>
        <span
          className={cx(adminStyles, "qb-legend-dot")}
          style={{ background: "var(--color-brand)" }}
        />
        男
      </span>
      <span className={cx(adminStyles, "qb-legend-item")}>
        <span
          className={cx(adminStyles, "qb-legend-dot")}
          style={{ background: "var(--color-accent)" }}
        />
        女
      </span>
      <span className={cx(adminStyles, "qb-legend-item")}>
        <span className={cx(adminStyles, "qb-legend-dot")} style={{ background: "var(--color-gold)" }} />
        非二元
      </span>
      <span className={cx(adminStyles, "qb-legend-item")}>
        <span
          className={cx(adminStyles, "qb-legend-dot")}
          style={{ background: "var(--color-neutral)" }}
        />
        未知
      </span>
    </div>
  );
}

function SectionHint({ children }: { children: string }) {
  return <p className={cx(adminStyles, "mp-section-hint")}>{children}</p>;
}

function Panel({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx(adminStyles, "mp-panel", className)}>
      <div className={cx(adminStyles, "mp-panel-head")}>
        <h3>{title}</h3>
        {hint ? <p className={cx(adminStyles, "mp-panel-sub")}>{hint}</p> : null}
      </div>
      <div className={cx(adminStyles, "mp-panel-body")}>{children}</div>
    </section>
  );
}

function funnelHasData(funnel: PromotionFunnel) {
  return funnel.steps.some((step) => step.count > 0);
}

function funnelStepsForKeys(
  funnel: PromotionFunnel,
  keys: readonly string[],
) {
  return keys.map((key) => {
    const step = funnel.steps.find((item) => item.key === key);
    return { key, count: step?.count ?? 0 };
  });
}

function stepGroupHasData(steps: { count: number }[]) {
  return steps.some((step) => step.count > 0);
}

function withinGroupConversionRate(
  steps: { count: number }[],
  stepIndex: number,
) {
  if (stepIndex <= 0) return null;

  const previous = steps[stepIndex - 1];
  const current = steps[stepIndex];
  if (!previous || !current || previous.count <= 0) return null;

  return `${Math.round((current.count / previous.count) * 100)}%`;
}

function FunnelStepList({
  steps,
  startIndex = 1,
  barClassName = "",
  showConversion = true,
}: {
  steps: { key: string; count: number }[];
  startIndex?: number;
  barClassName?: string;
  showConversion?: boolean;
}) {
  const max = Math.max(...steps.map((step) => step.count), 1);
  const hasData = stepGroupHasData(steps);

  return (
    <div className={cx(adminStyles, "mp-funnel-v", !hasData && "is-all-empty")}>
      {steps.map((step, index) => {
        const width =
          step.count > 0 ? Math.max(6, (step.count / max) * 100) : 0;
        const conversionRate = showConversion
          ? withinGroupConversionRate(steps, index)
          : null;

        return (
          <Fragment key={step.key}>
            {index > 0 && showConversion ? (
              <div className={cx(adminStyles, "mp-funnel-v-bridge")} aria-hidden>
                <span
                  className={cx(
                    adminStyles,
                    "mp-funnel-v-bridge-rate",
                    !conversionRate && "is-muted",
                  )}
                >
                  {conversionRate ?? "—"}
                </span>
              </div>
            ) : null}
            <div
              className={cx(
                adminStyles,
                "mp-funnel-v-row",
                step.count === 0 && "is-empty",
              )}
            >
              <div className={cx(adminStyles, "mp-funnel-v-meta")}>
                <span className={cx(adminStyles, "mp-funnel-v-index")}>{startIndex + index}</span>
                <span className={cx(adminStyles, "mp-funnel-v-label")}>
                  {STEP_LABELS[step.key] ?? step.key}
                </span>
              </div>
              <div className={cx(adminStyles, "mp-funnel-v-track")}>
                <div
                  className={cx(adminStyles, "mp-funnel-v-bar", barClassName)}
                  style={{ width: `${width}%` }}
                />
              </div>
              <span className={cx(adminStyles, "mp-funnel-v-count")}>{step.count}</span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

function FunnelChart({ funnel }: { funnel: PromotionFunnel }) {
  const reachSteps = funnelStepsForKeys(funnel, REACH_STEP_KEYS);
  const cohortSteps = funnelStepsForKeys(funnel, COHORT_STEP_KEYS);
  const hasData = funnelHasData(funnel);

  return (
    <>
      {!hasData ? (
        <p className={cx(adminStyles, "mp-funnel-empty-note")}>
          该时间范围内暂无数据，步骤结构如下。
        </p>
      ) : null}

      <div className={cx(adminStyles, "mp-funnel-split")}>
        <section className={cx(adminStyles, "mp-funnel-group")}>
          <header className={cx(adminStyles, "mp-funnel-group-head")}>
            <h4 className={cx(adminStyles, "mp-funnel-group-title")}>传播链路</h4>
            <p className={cx(adminStyles, "mp-funnel-group-desc")}>
              邀请链接的分享意图与落地页点击 UV，仅反映传播曝光。
            </p>
          </header>
          <FunnelStepList steps={reachSteps} startIndex={1} />
        </section>

        <div className={cx(adminStyles, "mp-funnel-separator")} role="separator">
          <span className={cx(adminStyles, "mp-funnel-separator-label")}>
            注册独立统计 · 含自然流与直填码
          </span>
        </div>

        <section className={cx(adminStyles, "mp-funnel-group")}>
          <header className={cx(adminStyles, "mp-funnel-group-head")}>
            <h4 className={cx(adminStyles, "mp-funnel-group-title")}>归属用户转化</h4>
            <p className={cx(adminStyles, "mp-funnel-group-desc")}>
              注册时归属本活动的用户 cohort，不要求经过上方分享或点击。
            </p>
          </header>
          <FunnelStepList
            steps={cohortSteps}
            startIndex={REACH_STEP_KEYS.length + 1}
            barClassName="is-cohort"
          />
        </section>
      </div>
    </>
  );
}

/** Groups channelBreakdown rows by medium, then lists scenes within each group.
 * Only rendered when rows.length > 0 — no empty-state branch needed. */
function ChannelBreakdownPanel({ rows }: { rows: PromotionChannelBreakdownRow[] }) {
  // Group by medium preserving insertion order.
  const byMedium = new Map<ReferralMedium, PromotionChannelBreakdownRow[]>();
  for (const row of rows) {
    const group = byMedium.get(row.medium);
    if (group) {
      group.push(row);
    } else {
      byMedium.set(row.medium, [row]);
    }
  }

  return (
    <>
      <div className={cx(adminStyles, "qb-table-wrap admin-table-wrap mp-table-panel")}>
        <table className={cx(adminStyles, "qb-table admin-table mp-data-table")}>
          <thead>
            <tr>
              <th scope="col">媒介</th>
              <th scope="col">场景</th>
              <th className={cx(adminStyles, "qb-num")} scope="col">分享</th>
              <th className={cx(adminStyles, "qb-num")} scope="col">点击</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(byMedium.entries()).map(([medium, mediumRows]) =>
              mediumRows.map((row, rowIdx) => (
                <tr key={`${medium}-${row.scene ?? "null"}`}>
                  {/* Merge medium cell across its rows */}
                  {rowIdx === 0 && (
                    <th
                      scope="rowgroup"
                      rowSpan={mediumRows.length}
                      className={cx(adminStyles, "qb-cell-strong")}
                    >
                      {MEDIUM_LABELS[medium]}
                    </th>
                  )}
                  <td>{row.scene ? (SCENE_LABELS[row.scene] ?? row.scene) : "—"}</td>
                  <td className={cx(adminStyles, "qb-num")}>{row.share}</td>
                  <td className={cx(adminStyles, "qb-num")}>{row.click}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      {/* Events with null/unknown channel are excluded from this breakdown,
          so row totals may be less than the funnel SHARE/CLICK counts. */}
      <p className={cx(adminStyles, "mp-section-hint")}>
        仅展示已标记渠道，合计可能小于分享/点击总数
      </p>
    </>
  );
}

function FunnelMetricCell({
  count,
  max,
  rowClass,
}: {
  count: number;
  max: number;
  rowClass: string;
}) {
  const width = max > 0 && count > 0 ? Math.max(8, (count / max) * 100) : 0;

  return (
    <td
      className={cx(
        adminStyles,
        "qb-num mp-funnel-cell",
        count === 0 && "is-zero",
      )}
    >
      <div className={cx(adminStyles, "mp-funnel-cell-inner")}>
        <span className={cx(adminStyles, "mp-funnel-cell-value")}>{count}</span>
        <span className={cx(adminStyles, "mp-funnel-cell-track")}>
          <span
            className={cx(adminStyles, "mp-funnel-cell-bar", rowClass)}
            style={{ width: `${width}%` }}
          />
        </span>
      </div>
    </td>
  );
}

function genderRowClass(gender: string) {
  switch (gender) {
    case "男":
    case "male":
      return "is-male";
    case "女":
    case "female":
      return "is-female";
    case "非二元":
    case "nonBinary":
      return "is-nonbinary";
    default:
      return "is-unknown";
  }
}

export default function AdminPromotionPage() {
  const [campaigns, setCampaigns] = useState<AdminCampaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [from, setFrom] = useState(isoDay(-29));
  const [to, setTo] = useState(isoDay(0));
  const [source, setSource] = useState<"PERSONAL" | "DEFAULT">("PERSONAL");
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");

  const [funnel, setFunnel] = useState<PromotionFunnel | null>(null);
  const [leaderboard, setLeaderboard] = useState<
    PaginatedResult<PromotionLeaderboardRow>
  >(emptyPage<PromotionLeaderboardRow>());
  const [coupons, setCoupons] = useState<PromotionCouponsRow[]>([]);
  const [redemptions, setRedemptions] = useState<
    PaginatedResult<PromotionRedemptionRow>
  >(emptyPage<PromotionRedemptionRow>());
  const [loading, setLoading] = useState(false);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [hasQueried, setHasQueried] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousSource = useRef(source);

  useEffect(() => {
    let active = true;
    void fetchApi<PaginatedResult<AdminCampaign>>("/admin/campaigns?pageSize=50")
      .then((result) => {
        if (!active) return;
        setCampaigns(result.items);
        setCampaignId((current) => current || pickDefaultCampaign(result.items));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const rangeParams = useCallback(() => {
    const fromIso = `${from}T00:00:00+08:00`;
    const toIso = `${to}T23:59:59.999+08:00`;
    return `campaignId=${encodeURIComponent(campaignId)}&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`;
  }, [campaignId, from, to]);

  const fetchLeaderboard = useCallback(
    (page: number) => {
      return fetchApi<PaginatedResult<PromotionLeaderboardRow>>(
        `/admin/promotion/leaderboard?${rangeParams()}&source=${source}&page=${page}&pageSize=${PAGE_SIZE}`,
      );
    },
    [rangeParams, source],
  );

  const fetchRedemptions = useCallback(
    (page: number) => {
      return fetchApi<PaginatedResult<PromotionRedemptionRow>>(
        `/admin/promotion/redemptions?${rangeParams()}&page=${page}&pageSize=${PAGE_SIZE}`,
      );
    },
    [rangeParams],
  );

  const loadLeaderboard = useCallback(
    async (page: number) => {
      setLeaderboardLoading(true);
      try {
        setLeaderboard(await fetchLeaderboard(page));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "排行榜加载失败。");
      } finally {
        setLeaderboardLoading(false);
      }
    },
    [fetchLeaderboard],
  );

  const query = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    setError(null);
    try {
      const [funnelData, leaderboardData, couponsData, redemptionsData] =
        await Promise.all([
          fetchApi<PromotionFunnel>(`/admin/promotion/funnel?${rangeParams()}`),
          fetchLeaderboard(1),
          fetchApi<{ items: PromotionCouponsRow[] }>(
            `/admin/promotion/coupons?${rangeParams()}`,
          ),
          fetchRedemptions(1),
        ]);
      setFunnel(funnelData);
      setLeaderboard(leaderboardData);
      setCoupons(couponsData.items);
      setRedemptions(redemptionsData);
      setHasQueried(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "查询失败。");
    } finally {
      setLoading(false);
    }
  }, [campaignId, fetchLeaderboard, fetchRedemptions, rangeParams]);

  useEffect(() => {
    if (!campaignId) return;
    const timer = window.setTimeout(() => {
      void query();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [campaignId, from, to, query]);

  useEffect(() => {
    if (!campaignId || !hasQueried) return;
    if (previousSource.current === source) return;
    previousSource.current = source;
    void loadLeaderboard(1);
  }, [campaignId, hasQueried, loadLeaderboard, source]);

  async function goLeaderboard(page: number) {
    try {
      setLeaderboard(await fetchLeaderboard(page));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "翻页失败。");
    }
  }

  async function goRedemptions(page: number) {
    try {
      setRedemptions(await fetchRedemptions(page));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "翻页失败。");
    }
  }

  function applyPreset(days: number) {
    setFrom(isoDay(-(days - 1)));
    setTo(isoDay(0));
  }

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === campaignId),
    [campaignId, campaigns],
  );

  const shared = funnel ? stepCount(funnel, "SHARE") : 0;
  const clicked = funnel ? stepCount(funnel, "CLICK") : 0;
  const registered = funnel ? stepCount(funnel, "REGISTER") : 0;
  const activated = funnel ? stepCount(funnel, "ACTIVATE") : 0;
  const granted = funnel ? stepCount(funnel, "GRANT") : 0;
  const redeemedPeople = funnel ? stepCount(funnel, "REDEEM") : 0;
  const maxInvited = Math.max(...leaderboard.items.map((row) => row.invited), 1);
  const hasCouponActivity =
    coupons.some((row) => row.granted > 0 || row.redeemed > 0) ||
    redemptions.total > 0;
  const genderStepMax = funnel
    ? Math.max(
        ...funnel.byGender.flatMap((row) => row.steps.map((step) => step.count)),
        1,
      )
    : 1;
  const couponTotals = coupons.reduce(
    (totals, row) => ({
      granted: totals.granted + row.granted,
      redeemed: totals.redeemed + row.redeemed,
    }),
    { granted: 0, redeemed: 0 },
  );
  const redemptionTotals = redemptions.items.reduce(
    (totals, row) => ({
      count: totals.count + row.count,
      faceValueTotal: totals.faceValueTotal + row.faceValueTotal,
    }),
    { count: 0, faceValueTotal: 0 },
  );

  return (
    <div className={cx(adminStyles, "qb-container")}>
      <div className={cx(adminStyles, "qb-header")}>
        <div>
          <h1>推广数据</h1>
          <p className={cx(adminStyles, "qb-header-desc")}>
            按活动与时间范围查看传播链路、归属用户转化、邀请排行榜与券发放核销对账。日期按中国时区自然日统计，测试账号已排除。
          </p>
        </div>
        <AdminRefreshButton
          onClick={() => void query()}
          disabled={loading || !campaignId}
        />
      </div>

      <div className={cx(adminStyles, "mp-filter-bar mp-filter-bar-sticky")}>
        <div className={cx(adminStyles, "mp-filter-bar-head")}>
          <span className={cx(adminStyles, "mp-filter-bar-title")}>筛选条件</span>
          {selectedCampaign ? (
            <span className={cx(adminStyles, "mp-filter-bar-summary")}>
              {selectedCampaign.name}
              <span className={cx(adminStyles, "mp-context-sep")}>·</span>
              {CAMPAIGN_STATUS_LABELS[selectedCampaign.status] ??
                selectedCampaign.status}
              <span className={cx(adminStyles, "mp-context-sep")}>·</span>
              {from} 至 {to}
              {loading && hasQueried ? (
                <>
                  <span className={cx(adminStyles, "mp-context-sep")}>·</span>
                  <span className={cx(adminStyles, "mp-context-loading")}>更新中…</span>
                </>
              ) : null}
            </span>
          ) : null}
        </div>

        <div className={cx(adminStyles, "mp-filter-bar-grid")}>
          <div className={cx(adminStyles, "mp-filter-row")}>
            <div className={cx(adminStyles, "mp-filter-field mp-filter-field-wide")}>
              <span>活动</span>
              <select
                value={campaignId}
                aria-label="选择活动"
                onChange={(event) => setCampaignId(event.target.value)}
              >
                <option value="">选择活动…</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}（
                    {CAMPAIGN_STATUS_LABELS[campaign.status] ?? campaign.status}
                    {campaign.isDefault ? " · 默认" : ""}）
                  </option>
                ))}
              </select>
            </div>

            <div className={cx(adminStyles, "mp-filter-range")}>
              <div className={cx(adminStyles, "mp-filter-field")}>
                <span>开始</span>
                <input
                  type="date"
                  value={from}
                  aria-label="开始日期"
                  onChange={(event) => setFrom(event.target.value)}
                />
              </div>
              <span className={cx(adminStyles, "mp-filter-range-sep")}>至</span>
              <div className={cx(adminStyles, "mp-filter-field")}>
                <span>结束</span>
                <input
                  type="date"
                  value={to}
                  aria-label="结束日期"
                  onChange={(event) => setTo(event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className={cx(adminStyles, "mp-date-presets")} role="group" aria-label="快捷日期">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.days}
                type="button"
                className={cx(
                  adminStyles,
                  "mp-date-preset",
                  presetMatches(from, to, preset.days) && "is-active",
                )}
                onClick={() => applyPreset(preset.days)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="ui-form-message ui-form-message--error">{error}</p>}

      {loading && !hasQueried && (
        <div className={cx(adminStyles, "mp-loading-inline")}>正在加载推广数据…</div>
      )}

      {!loading && !hasQueried && !campaignId && (
        <div className={cx(adminStyles, "admin-empty-state mp-empty-query")}>
          还没有活动数据。请先在「活动券包」页创建活动，再回到此处查看推广效果。
        </div>
      )}

      {hasQueried && (
        <>
          <div className={cx(adminStyles, "admin-tabs mp-dashboard-tabs")}>
            {DASHBOARD_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={activeTab === tab.key ? "ui-segmented-item active" : "ui-segmented-item"}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "overview" && funnel && (
            <>
              <SectionHint>{PEOPLE_METRIC_HINT}</SectionHint>

              <div className={cx(adminStyles, "qb-metrics mp-metrics-inline")}>
                <div className={cx(adminStyles, "qb-metric")}>
                  <div className={cx(adminStyles, "qb-metric-value")}>{shared}</div>
                  <div className={cx(adminStyles, "qb-metric-label")}>分享</div>
                </div>
                <div className={cx(adminStyles, "qb-metric")}>
                  <div className={cx(adminStyles, "qb-metric-value")}>{clicked}</div>
                  <div className={cx(adminStyles, "qb-metric-label")}>点击 UV</div>
                </div>
                <div className={cx(adminStyles, "qb-metric")}>
                  <div className={cx(adminStyles, "qb-metric-value")}>{registered}</div>
                  <div className={cx(adminStyles, "qb-metric-label")}>归属注册</div>
                </div>
                <div className={cx(adminStyles, "qb-metric")}>
                  <div className={cx(adminStyles, "qb-metric-value")}>
                    {pctRate(activated, registered)}
                  </div>
                  <div className={cx(adminStyles, "qb-metric-label")}>激活率</div>
                </div>
                <div className={cx(adminStyles, "qb-metric")}>
                  <div className={cx(adminStyles, "qb-metric-value")}>{redeemedPeople}</div>
                  <div className={cx(adminStyles, "qb-metric-label")}>核销人数</div>
                </div>
                <div className={cx(adminStyles, "qb-metric")}>
                  <div className={cx(adminStyles, "qb-metric-value")}>
                    {pctRate(redeemedPeople, granted)}
                  </div>
                  <div className={cx(adminStyles, "qb-metric-label")}>领券核销率</div>
                </div>
              </div>

              <Panel
                title="拉新数据"
                hint="传播链路与归属用户转化分段统计；段内箭头旁为相邻步骤转化率。"
              >
                <FunnelChart funnel={funnel} />
              </Panel>

              {funnel.channelBreakdown && funnel.channelBreakdown.length > 0 && (
                <Panel
                  title="渠道分解"
                  hint="按媒介（第一层）与场景（第二层）拆分分享与点击 UV。"
                >
                  <ChannelBreakdownPanel rows={funnel.channelBreakdown} />
                </Panel>
              )}

              {funnel.byGender.length > 0 && (
                <Panel
                  title="分性别归属用户"
                  hint="仅统计归属注册及之后步骤；条形长度为该列最大值内的相对占比。"
                >
                  <GenderLegend />
                  {!funnel.byGender.some((row) =>
                    row.steps.some((step) => step.count > 0),
                  ) ? (
                    <p className={cx(adminStyles, "mp-funnel-empty-note")}>
                      该时间范围内暂无分性别归属用户数据。
                    </p>
                  ) : null}
                  <div className={cx(adminStyles, "qb-table-wrap admin-table-wrap mp-table-panel mp-gender-table-wrap")}>
                    <table className={cx(adminStyles, "qb-table admin-table mp-data-table mp-gender-table")}>
                      <thead>
                        <tr>
                          <th scope="col">性别</th>
                          {funnel.byGender[0]?.steps.map((step) => (
                            <th key={step.key} className={cx(adminStyles, "qb-num")} scope="col">
                              {STEP_LABELS[step.key] ?? step.key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {funnel.byGender.map((row) => {
                          const rowClass = genderRowClass(row.gender);

                          return (
                            <tr
                              key={row.gender}
                              className={cx(
                                adminStyles,
                                "mp-gender-row",
                                rowClass,
                              )}
                            >
                              <th scope="row">
                                <span className={cx(adminStyles, "mp-gender-chip")}>
                                  {GENDER_LABELS[row.gender] ?? row.gender}
                                </span>
                              </th>
                              {row.steps.map((step) => (
                                <FunnelMetricCell
                                  key={step.key}
                                  count={step.count}
                                  max={genderStepMax}
                                  rowClass={rowClass}
                                />
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              )}
            </>
          )}

          {activeTab === "leaderboard" && (
            <Panel title="邀请排行榜" hint={PEOPLE_METRIC_HINT}>
              <div className={cx(adminStyles, "admin-tabs mp-source-tabs")}>
                <button
                  type="button"
                  className={
                    source === "PERSONAL" ? "ui-segmented-item active" : "ui-segmented-item"
                  }
                  onClick={() => setSource("PERSONAL")}
                >
                  个人码榜
                </button>
                <button
                  type="button"
                  className={
                    source === "DEFAULT" ? "ui-segmented-item active" : "ui-segmented-item"
                  }
                  onClick={() => setSource("DEFAULT")}
                >
                  默认活动
                </button>
              </div>

              <GenderLegend />

              {leaderboardLoading && leaderboard.items.length === 0 ? (
                <div className={cx(adminStyles, "mp-loading-inline")}>正在加载排行榜…</div>
              ) : leaderboard.items.length === 0 ? (
                <div className={cx(adminStyles, "admin-empty-state mp-empty-query")}>
                  该时间范围内暂无
                  {source === "PERSONAL" ? "个人码" : "默认活动"}邀请记录。
                  {hasCouponActivity
                    ? " 若下方「券与对账」已有数据，说明用户可能通过其他渠道注册或直接领券，未计入本榜。"
                    : ""}
                </div>
              ) : (
                <>
                  <div className={cx(adminStyles, "qb-table-wrap admin-table-wrap mp-table-panel")}>
                    <table className={cx(adminStyles, "qb-table admin-table mp-data-table")}>
                      <thead>
                        <tr>
                          <th>来源</th>
                          <th className={cx(adminStyles, "qb-num")}>邀请</th>
                          <th className={cx(adminStyles, "qb-num")}>激活</th>
                          <th className={cx(adminStyles, "qb-num")}>领券</th>
                          <th className={cx(adminStyles, "qb-num")}>核销</th>
                          <th>性别分布</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboard.items.map((row) => (
                          <tr key={`${row.sourceType}-${row.refLabel}`}>
                            <td className={cx(adminStyles, "qb-cell-strong")}>
                              {row.sourceType === "DEFAULT" ? "默认活动" : row.refLabel}
                            </td>
                            <td className={cx(adminStyles, "qb-num")}>
                              <span className={cx(adminStyles, "qb-minibar-cell")}>
                                <span
                                  className={cx(adminStyles, "qb-minibar")}
                                  style={{
                                    width: `${((row.invited / maxInvited) * 4).toFixed(2)}rem`,
                                  }}
                                />
                                {row.invited}
                              </span>
                            </td>
                            <td className={cx(adminStyles, "qb-num")}>{row.activated}</td>
                            <td className={cx(adminStyles, "qb-num")}>{row.granted}</td>
                            <td className={cx(adminStyles, "qb-num")}>{row.redeemed}</td>
                            <td>
                              <GenderBar g={row.byGender} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {leaderboard.totalPages > 1 && (
                    <AdminPagination
                      className={cx(adminStyles, "admin-pagination")}
                      page={leaderboard.page}
                      totalPages={leaderboard.totalPages}
                      total={leaderboard.total}
                      onPageChange={(nextPage) => void goLeaderboard(nextPage)}
                    />
                  )}
                </>
              )}
            </Panel>
          )}

          {activeTab === "coupons" && (
            <>
              <SectionHint>
                以下统计核销单数与券面值合计，与概览/排行榜中的去重人数口径不同，请勿直接对比数字。
              </SectionHint>

              <Panel title="券情况" hint="按商家汇总发放与核销张数。">
                  {coupons.length === 0 ? (
                    <div className={cx(adminStyles, "admin-empty-state mp-panel-empty")}>
                      该时间范围内暂无发券记录。
                    </div>
                  ) : (
                    <div className={cx(adminStyles, "qb-table-wrap admin-table-wrap mp-table-panel")}>
                      <table className={cx(adminStyles, "qb-table admin-table mp-data-table")}>
                        <thead>
                          <tr>
                            <th>商家</th>
                            <th className={cx(adminStyles, "qb-num")}>发放</th>
                            <th className={cx(adminStyles, "qb-num")}>核销</th>
                            <th className={cx(adminStyles, "qb-num")}>核销率</th>
                          </tr>
                        </thead>
                        <tbody>
                          {coupons.map((row) => (
                            <tr key={row.merchantId}>
                              <td className={cx(adminStyles, "qb-cell-strong")}>{row.merchantName}</td>
                              <td className={cx(adminStyles, "qb-num")}>{row.granted}</td>
                              <td className={cx(adminStyles, "qb-num")}>{row.redeemed}</td>
                              <td className={cx(adminStyles, "qb-num mp-rate-cell")}>
                                {pctRate(row.redeemed, row.granted)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        {coupons.length > 1 && (
                          <tfoot>
                            <tr className={cx(adminStyles, "mp-table-foot")}>
                              <td>合计</td>
                              <td className={cx(adminStyles, "qb-num")}>{couponTotals.granted}</td>
                              <td className={cx(adminStyles, "qb-num")}>{couponTotals.redeemed}</td>
                              <td className={cx(adminStyles, "qb-num mp-rate-cell")}>
                                {pctRate(couponTotals.redeemed, couponTotals.granted)}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  )}
                </Panel>

                <Panel title="核销对账" hint="按商家与业务日汇总核销单数与面值。">
                  {redemptions.items.length === 0 ? (
                    <div className={cx(adminStyles, "admin-empty-state mp-panel-empty")}>
                      该时间范围内暂无核销记录。
                    </div>
                  ) : (
                    <>
                      <div className={cx(adminStyles, "qb-table-wrap admin-table-wrap mp-table-panel")}>
                        <table className={cx(adminStyles, "qb-table admin-table mp-data-table")}>
                          <thead>
                            <tr>
                              <th>日期</th>
                              <th>商家</th>
                              <th className={cx(adminStyles, "qb-num")}>单数</th>
                              <th className={cx(adminStyles, "qb-num")}>面值</th>
                            </tr>
                          </thead>
                          <tbody>
                            {redemptions.items.map((row) => (
                              <tr key={`${row.day}-${row.merchantId}`}>
                                <td className={cx(adminStyles, "mp-date-cell")}>{row.day}</td>
                                <td className={cx(adminStyles, "qb-cell-strong")}>{row.merchantName}</td>
                                <td className={cx(adminStyles, "qb-num")}>{row.count}</td>
                                <td className={cx(adminStyles, "qb-num qb-cell-strong mp-money-cell")}>
                                  {yuan(row.faceValueTotal)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          {redemptions.items.length > 1 && (
                            <tfoot>
                              <tr className={cx(adminStyles, "mp-table-foot")}>
                                <td colSpan={2}>本页合计</td>
                                <td className={cx(adminStyles, "qb-num")}>{redemptionTotals.count}</td>
                                <td className={cx(adminStyles, "qb-num qb-cell-strong mp-money-cell")}>
                                  {yuan(redemptionTotals.faceValueTotal)}
                                </td>
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                      {redemptions.totalPages > 1 && (
                        <AdminPagination
                          className={cx(adminStyles, "admin-pagination")}
                          page={redemptions.page}
                          totalPages={redemptions.totalPages}
                          total={redemptions.total}
                          onPageChange={(nextPage) => void goRedemptions(nextPage)}
                        />
                      )}
                    </>
                  )}
                </Panel>
            </>
          )}
        </>
      )}
    </div>
  );
}

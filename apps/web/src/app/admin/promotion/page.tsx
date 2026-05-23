"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { fetchApi } from "../../../lib/api";
import {
  AdminRefreshButton,
  CAMPAIGN_STATUS_LABELS,
} from "../merchant-admin-ui";
import type {
  AdminCampaign,
  PaginatedResult,
  PromotionCouponsRow,
  PromotionFunnel,
  PromotionLeaderboardRow,
  PromotionRedemptionRow,
} from "../types";

const PAGE_SIZE = 20;

const STEP_LABELS: Record<string, string> = {
  invited: "邀请",
  registered: "注册",
  activated: "激活",
  granted: "领券",
  redeemed: "核销",
};

const GENDER_LABELS: Record<string, string> = {
  male: "男",
  female: "女",
  nonBinary: "非二元",
  unknown: "未知",
};

const DATE_PRESETS = [
  { label: "近 7 天", days: 7 },
  { label: "近 30 天", days: 30 },
  { label: "近 90 天", days: 90 },
] as const;

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

function GenderBar({
  g,
}: {
  g: { male: number; female: number; nonBinary: number; unknown: number };
}) {
  const total = g.male + g.female + g.nonBinary + g.unknown;
  if (total === 0) return <span className="qb-genderbar ic-genderbar-empty" />;
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
  return (
    <div
      className="qb-genderbar"
      title={`男 ${g.male} · 女 ${g.female} · 非二元 ${g.nonBinary} · 未知 ${g.unknown}`}
    >
      <span
        className="qb-genderbar-seg is-male"
        style={{ width: pct(g.male) }}
      />
      <span
        className="qb-genderbar-seg is-female"
        style={{ width: pct(g.female) }}
      />
      <span
        className="qb-genderbar-seg is-nonbinary"
        style={{ width: pct(g.nonBinary) }}
      />
      <span
        className="qb-genderbar-seg is-unknown"
        style={{ width: pct(g.unknown) }}
      />
    </div>
  );
}

function GenderLegend() {
  return (
    <div className="qb-legend ic-gender-legend">
      <span className="qb-legend-item">
        <span
          className="qb-legend-dot"
          style={{ background: "var(--primary)" }}
        />
        男
      </span>
      <span className="qb-legend-item">
        <span
          className="qb-legend-dot"
          style={{ background: "var(--accent)" }}
        />
        女
      </span>
      <span className="qb-legend-item">
        <span className="qb-legend-dot" style={{ background: "var(--gold)" }} />
        非二元
      </span>
      <span className="qb-legend-item">
        <span
          className="qb-legend-dot"
          style={{ background: "var(--neutral)" }}
        />
        未知
      </span>
    </div>
  );
}

export default function AdminPromotionPage() {
  const [campaigns, setCampaigns] = useState<AdminCampaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [from, setFrom] = useState(isoDay(-29));
  const [to, setTo] = useState(isoDay(0));
  const [source, setSource] = useState<"personal" | "recruiter">("personal");

  const [funnel, setFunnel] = useState<PromotionFunnel | null>(null);
  const [leaderboard, setLeaderboard] = useState<
    PaginatedResult<PromotionLeaderboardRow>
  >(emptyPage<PromotionLeaderboardRow>());
  const [coupons, setCoupons] = useState<PromotionCouponsRow[]>([]);
  const [redemptions, setRedemptions] = useState<
    PaginatedResult<PromotionRedemptionRow>
  >(emptyPage<PromotionRedemptionRow>());
  const [loading, setLoading] = useState(false);
  const [hasQueried, setHasQueried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchApi<PaginatedResult<AdminCampaign>>("/admin/campaigns?pageSize=50")
      .then((result) => {
        if (!active) return;
        setCampaigns(result.items);
        if (result.items[0]) setCampaignId(result.items[0].id);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const rangeParams = useCallback(() => {
    return `campaignId=${encodeURIComponent(campaignId)}&from=${from}T00:00:00+08:00&to=${to}T23:59:59.999+08:00`;
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
  }, [campaignId, from, to, source, query]);

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

  const funnelMax = funnel?.steps[0]?.count || 1;
  const invited = funnel ? stepCount(funnel, "invited") : 0;
  const activated = funnel ? stepCount(funnel, "activated") : 0;
  const granted = funnel ? stepCount(funnel, "granted") : 0;
  const redeemed = funnel ? stepCount(funnel, "redeemed") : 0;
  const maxInvited = Math.max(...leaderboard.items.map((row) => row.invited), 1);

  return (
    <div className="qb-container">
      <div className="qb-header">
        <div>
          <h1>推广数据</h1>
          <p className="qb-header-desc">
            按活动与时间范围（Asia/Shanghai 业务日）查看拉新漏斗、邀请排行榜、券情况与核销对账。测试账号已排除。
          </p>
        </div>
        <AdminRefreshButton onClick={() => void query()} />
      </div>

      <div className="mp-filter-bar">
        <div className="mp-filter-field">
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
                {CAMPAIGN_STATUS_LABELS[campaign.status] ?? campaign.status}）
              </option>
            ))}
          </select>
        </div>

        <div className="mp-filter-field">
          <span>开始日期</span>
          <input
            type="date"
            value={from}
            aria-label="开始日期"
            onChange={(event) => setFrom(event.target.value)}
          />
        </div>

        <div className="mp-filter-field">
          <span>结束日期</span>
          <input
            type="date"
            value={to}
            aria-label="结束日期"
            onChange={(event) => setTo(event.target.value)}
          />
        </div>

        <div className="mp-filter-field">
          <span>排行榜</span>
          <select
            value={source}
            aria-label="排行榜类型"
            onChange={(event) =>
              setSource(event.target.value as "personal" | "recruiter")
            }
          >
            <option value="personal">个人码榜</option>
            <option value="recruiter">运营码榜</option>
          </select>
        </div>

        <div className="mp-filter-actions">
          <button
            className="button-primary"
            type="button"
            disabled={loading || !campaignId}
            onClick={() => void query()}
          >
            {loading ? "加载中…" : "立即刷新"}
          </button>
        </div>

        <div className="mp-date-presets">
          {DATE_PRESETS.map((preset) => (
            <button
              key={preset.days}
              type="button"
              className={`mp-date-preset${
                presetMatches(from, to, preset.days) ? " is-active" : ""
              }`}
              onClick={() => applyPreset(preset.days)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {selectedCampaign && (
        <p className="qb-header-desc" style={{ marginTop: "-0.35rem" }}>
          当前活动：<strong>{selectedCampaign.name}</strong> · slug{" "}
          <code className="mp-slug">{selectedCampaign.slug}</code> ·{" "}
          {from} 至 {to}
        </p>
      )}

      {error && <p className="form-error">{error}</p>}

      {loading && !hasQueried && (
        <div className="mp-loading-inline">正在加载推广数据…</div>
      )}

      {!loading && !hasQueried && !campaignId && (
        <div className="admin-empty-state mp-empty-query">
          还没有活动数据。请先在「活动券包」页创建活动，再回到此处查看推广效果。
        </div>
      )}

      {funnel && (
        <>
          <div className="qb-metrics">
            <div className="qb-metric">
              <div className="qb-metric-value">{invited}</div>
              <div className="qb-metric-label">总邀请</div>
            </div>
            <div className="qb-metric">
              <div className="qb-metric-value">
                {invited > 0
                  ? `${Math.round((activated / invited) * 100)}%`
                  : "—"}
              </div>
              <div className="qb-metric-label">激活率</div>
            </div>
            <div className="qb-metric">
              <div className="qb-metric-value">{redeemed}</div>
              <div className="qb-metric-label">已核销</div>
            </div>
            <div className="qb-metric">
              <div className="qb-metric-value">
                {granted > 0
                  ? `${Math.round((redeemed / granted) * 100)}%`
                  : "—"}
              </div>
              <div className="qb-metric-label">核销率</div>
            </div>
          </div>

          <section className="qb-section">
            <h3>拉新漏斗</h3>
            <div className="qb-funnel">
              {funnel.steps.map((step, index) => {
                const conv =
                  index > 0
                    ? funnel.conversions.find((c) => c.to === step.key)
                    : null;
                const pct = Math.round((step.count / funnelMax) * 100);
                return (
                  <Fragment key={step.key}>
                    {conv && (
                      <div className="qb-funnel-rate">
                        ↓ {(conv.rate * 100).toFixed(1)}%
                      </div>
                    )}
                    <div className="qb-funnel-step">
                      <span className="qb-funnel-label">
                        {STEP_LABELS[step.key] ?? step.key}
                      </span>
                      <div className="qb-funnel-bar-wrap">
                        <div
                          className="qb-funnel-bar"
                          style={{ width: `${pct}%` }}
                        />
                        <span className="qb-funnel-count">{step.count}</span>
                      </div>
                    </div>
                  </Fragment>
                );
              })}
            </div>
          </section>

          {funnel.byGender.length > 0 && (
            <section className="qb-section">
              <h3>分性别漏斗</h3>
              <div className="qb-table-wrap admin-table-wrap">
                <table className="qb-table admin-table">
                  <thead>
                    <tr>
                      <th>性别</th>
                      {funnel.byGender[0]?.steps.map((step) => (
                        <th key={step.key} className="qb-num">
                          {STEP_LABELS[step.key] ?? step.key}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {funnel.byGender.map((row) => (
                      <tr key={row.gender}>
                        <td>{GENDER_LABELS[row.gender] ?? row.gender}</td>
                        {row.steps.map((step) => (
                          <td key={step.key} className="qb-num">
                            {step.count}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {hasQueried && (
        <section className="qb-section">
          <h3>邀请排行榜（{source === "personal" ? "个人码" : "运营码"}）</h3>
          <GenderLegend />
          {leaderboard.items.length === 0 ? (
            <div className="admin-empty-state" style={{ marginTop: "0.75rem" }}>
              该时间范围内暂无邀请记录。
            </div>
          ) : (
            <>
              <div className="qb-table-wrap admin-table-wrap">
                <table className="qb-table admin-table">
                  <thead>
                    <tr>
                      <th>来源</th>
                      <th className="qb-num">邀请</th>
                      <th className="qb-num">激活</th>
                      <th className="qb-num">领券</th>
                      <th className="qb-num">核销</th>
                      <th>性别分布</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.items.map((row) => (
                      <tr key={`${row.sourceType}-${row.refLabel}`}>
                        <td className="qb-cell-strong">{row.refLabel}</td>
                        <td className="qb-num">
                          <span className="qb-minibar-cell">
                            <span
                              className="qb-minibar"
                              style={{
                                width: `${((row.invited / maxInvited) * 4).toFixed(2)}rem`,
                              }}
                            />
                            {row.invited}
                          </span>
                        </td>
                        <td className="qb-num">{row.activated}</td>
                        <td className="qb-num">{row.granted}</td>
                        <td className="qb-num">{row.redeemed}</td>
                        <td>
                          <GenderBar g={row.byGender} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {leaderboard.totalPages > 1 && (
                <div className="admin-pagination">
                  <button
                    disabled={leaderboard.page <= 1}
                    onClick={() => void goLeaderboard(leaderboard.page - 1)}
                    type="button"
                  >
                    上一页
                  </button>
                  <span>
                    {leaderboard.page} / {leaderboard.totalPages} · 共{" "}
                    {leaderboard.total}
                  </span>
                  <button
                    disabled={leaderboard.page >= leaderboard.totalPages}
                    onClick={() => void goLeaderboard(leaderboard.page + 1)}
                    type="button"
                  >
                    下一页
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {hasQueried && (
        <section className="qb-section">
          <h3>券情况（按商家）</h3>
          {coupons.length === 0 ? (
            <div className="admin-empty-state" style={{ marginTop: "0.75rem" }}>
              该时间范围内暂无发券记录。
            </div>
          ) : (
            <div className="qb-table-wrap admin-table-wrap">
              <table className="qb-table admin-table">
                <thead>
                  <tr>
                    <th>商家</th>
                    <th className="qb-num">发放</th>
                    <th className="qb-num">核销</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.map((row) => (
                    <tr key={row.merchantId}>
                      <td>{row.merchantName}</td>
                      <td className="qb-num">{row.granted}</td>
                      <td className="qb-num">{row.redeemed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {hasQueried && (
        <section className="qb-section">
          <h3>核销对账（按商家 + 天）</h3>
          {redemptions.items.length === 0 ? (
            <div className="admin-empty-state" style={{ marginTop: "0.75rem" }}>
              该时间范围内暂无核销记录。
            </div>
          ) : (
            <>
              <div className="qb-table-wrap admin-table-wrap">
                <table className="qb-table admin-table">
                  <thead>
                    <tr>
                      <th>日期</th>
                      <th>商家</th>
                      <th className="qb-num">核销单数</th>
                      <th className="qb-num">面值合计</th>
                    </tr>
                  </thead>
                  <tbody>
                    {redemptions.items.map((row) => (
                      <tr key={`${row.day}-${row.merchantId}`}>
                        <td>{row.day}</td>
                        <td>{row.merchantName}</td>
                        <td className="qb-num">{row.count}</td>
                        <td className="qb-num qb-cell-strong">
                          {yuan(row.faceValueTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {redemptions.totalPages > 1 && (
                <div className="admin-pagination">
                  <button
                    disabled={redemptions.page <= 1}
                    onClick={() => void goRedemptions(redemptions.page - 1)}
                    type="button"
                  >
                    上一页
                  </button>
                  <span>
                    {redemptions.page} / {redemptions.totalPages} · 共{" "}
                    {redemptions.total}
                  </span>
                  <button
                    disabled={redemptions.page >= redemptions.totalPages}
                    onClick={() => void goRedemptions(redemptions.page + 1)}
                    type="button"
                  >
                    下一页
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}

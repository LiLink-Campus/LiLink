"use client";

import { useEffect, useState } from "react";
import { fetchApi } from "../../../lib/api";
import type {
  AdminCampaign,
  PaginatedResult,
  PromotionCouponsRow,
  PromotionFunnel,
  PromotionLeaderboardRow,
  PromotionRedemptionRow,
} from "../types";

const PAGE_SIZE = 20;

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

export default function AdminPromotionPage() {
  const [campaigns, setCampaigns] = useState<AdminCampaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [from, setFrom] = useState(isoDay(-30));
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

  // Asia/Shanghai (+08:00) business-day boundaries, matching the reconciliation
  // day used server-side.
  function rangeParams() {
    return `campaignId=${encodeURIComponent(campaignId)}&from=${from}T00:00:00+08:00&to=${to}T23:59:59.999+08:00`;
  }

  function fetchLeaderboard(page: number) {
    return fetchApi<PaginatedResult<PromotionLeaderboardRow>>(
      `/admin/promotion/leaderboard?${rangeParams()}&source=${source}&page=${page}&pageSize=${PAGE_SIZE}`,
    );
  }

  function fetchRedemptions(page: number) {
    return fetchApi<PaginatedResult<PromotionRedemptionRow>>(
      `/admin/promotion/redemptions?${rangeParams()}&page=${page}&pageSize=${PAGE_SIZE}`,
    );
  }

  async function query() {
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "查询失败。");
    } finally {
      setLoading(false);
    }
  }

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

  return (
    <div className="qb-container">
      <div className="qb-header">
        <div>
          <h1>推广数据</h1>
          <p className="qb-header-desc">
            按活动 + 时间范围（Asia/Shanghai 业务日）查看拉新漏斗、邀请排行榜、券情况与核销对账。测试账号已排除。
          </p>
        </div>
      </div>

      <div className="qb-search" style={{ flexWrap: "wrap", alignItems: "center" }}>
        <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
          <option value="">选择活动…</option>
          {campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name}（{campaign.status}）
            </option>
          ))}
        </select>
        <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <select
          value={source}
          onChange={(event) =>
            setSource(event.target.value as "personal" | "recruiter")
          }
        >
          <option value="personal">个人码榜</option>
          <option value="recruiter">运营码榜</option>
        </select>
        <button
          className="button-primary"
          type="button"
          disabled={loading || !campaignId}
          onClick={() => void query()}
        >
          {loading ? "查询中…" : "查询"}
        </button>
      </div>

      {error && <p className="form-error">{error}</p>}

      {funnel && (
        <section style={{ marginTop: "1.5rem" }}>
          <h3>拉新漏斗</h3>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            {funnel.steps.map((step) => (
              <div key={step.key} className="qb-stat-pill active">
                {step.key}
                <span className="qb-stat-count">{step.count}</span>
              </div>
            ))}
          </div>
          <p className="qb-header-desc" style={{ marginTop: "0.5rem" }}>
            转化率：
            {funnel.conversions
              .map((c) => `${c.from}→${c.to} ${(c.rate * 100).toFixed(1)}%`)
              .join("　")}
          </p>
          <table style={{ width: "100%", marginTop: "0.5rem", fontSize: "0.88rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>性别</th>
                <th>注册</th>
                <th>激活</th>
                <th>领券</th>
                <th>核销</th>
              </tr>
            </thead>
            <tbody>
              {funnel.byGender.map((row) => (
                <tr key={row.gender}>
                  <td>{row.gender}</td>
                  {row.steps.map((step) => (
                    <td key={step.key} style={{ textAlign: "center" }}>
                      {step.count}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {leaderboard.items.length > 0 && (
        <section style={{ marginTop: "1.5rem" }}>
          <h3>邀请排行榜（{source === "personal" ? "个人码" : "运营码"}）</h3>
          <table style={{ width: "100%", fontSize: "0.88rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>来源</th>
                <th>邀请</th>
                <th>激活</th>
                <th>领券</th>
                <th>核销</th>
                <th>男/女/非二元/未知</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.items.map((row) => (
                <tr key={`${row.sourceType}-${row.refLabel}`}>
                  <td>{row.refLabel}</td>
                  <td style={{ textAlign: "center" }}>{row.invited}</td>
                  <td style={{ textAlign: "center" }}>{row.activated}</td>
                  <td style={{ textAlign: "center" }}>{row.granted}</td>
                  <td style={{ textAlign: "center" }}>{row.redeemed}</td>
                  <td style={{ textAlign: "center" }}>
                    {row.byGender.male}/{row.byGender.female}/
                    {row.byGender.nonBinary}/{row.byGender.unknown}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                {leaderboard.page} / {leaderboard.totalPages} · 共 {leaderboard.total}
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
        </section>
      )}

      {coupons.length > 0 && (
        <section style={{ marginTop: "1.5rem" }}>
          <h3>券情况（按商家）</h3>
          <table style={{ width: "100%", fontSize: "0.88rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>商家</th>
                <th>发放</th>
                <th>核销</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((row) => (
                <tr key={row.merchantId}>
                  <td>{row.merchantName}</td>
                  <td style={{ textAlign: "center" }}>{row.granted}</td>
                  <td style={{ textAlign: "center" }}>{row.redeemed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {redemptions.items.length > 0 && (
        <section style={{ marginTop: "1.5rem" }}>
          <h3>核销对账（按商家 + 天）</h3>
          <table style={{ width: "100%", fontSize: "0.88rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>日期</th>
                <th style={{ textAlign: "left" }}>商家</th>
                <th>核销单数</th>
                <th>面值合计</th>
              </tr>
            </thead>
            <tbody>
              {redemptions.items.map((row) => (
                <tr key={`${row.day}-${row.merchantId}`}>
                  <td>{row.day}</td>
                  <td>{row.merchantName}</td>
                  <td style={{ textAlign: "center" }}>{row.count}</td>
                  <td style={{ textAlign: "center" }}>{yuan(row.faceValueTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
                {redemptions.page} / {redemptions.totalPages} · 共 {redemptions.total}
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
        </section>
      )}
    </div>
  );
}

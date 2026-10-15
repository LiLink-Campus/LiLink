"use client";
import { useEffect, useState } from "react";
import { fetchApi } from "@/lib/api";
import { cx } from "../admin-class-names";
import commonStyles from "../admin-common.module.css";
import cardStyles from "../admin-card.module.css";
import merchantStyles from "../merchant-admin.module.css";
import styles from "../growth.module.css";
import type { PromotionRedemptionRow, PaginatedResult } from "../types";
import { AdminPagination } from "../admin-pagination";
const adminStyles = [commonStyles, cardStyles, merchantStyles];
type Results = {
  recipients: number;
  issued: number;
  redeemed: number;
  expired: number;
  templates: { title: string; merchant: string; issued: number; redeemed: number }[];
};
export function CampaignResults({ campaignId }: { campaignId: string }) {
  const [data, setData] = useState<Results | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    fetchApi<Results>(`/admin/campaigns/${campaignId}/results`)
      .then((r) => {
        if (alive) setData(r);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [campaignId]);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p className={styles.empty}>加载发放结果…</p>;
  return (
    <div className={styles.page}>
      <p className={styles.muted}>
        本活动累计数据，排除测试账号。保留历史发放与核销记录，与邀请来源无关。
      </p>
      <div className={styles.metrics}>
        {[
          ["领券人数", data.recipients],
          ["已发券数", data.issued],
          ["已核销券数", data.redeemed],
          ["已过期未用", data.expired],
        ].map(([label, value]) => (
          <div className={styles.metric} key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {data.templates.length ? (
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>优惠券 / 商家</th>
                <th>已发放</th>
                <th>已核销</th>
              </tr>
            </thead>
            <tbody>
              {data.templates.map((t, i) => (
                <tr key={i}>
                  <td>
                    {t.title}
                    <p className={styles.muted}>{t.merchant}</p>
                  </td>
                  <td>{t.issued}</td>
                  <td>{t.redeemed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.empty}>
          还没有发放记录。活动发布后，符合条件的用户领取时会在这里累计。
        </p>
      )}
      <CampaignRedemptions campaignId={campaignId} />
    </div>
  );
}

function CampaignRedemptions({ campaignId }: { campaignId: string }) {
  const day = (offset: number) =>
    new Date(Date.now() + 8 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(() => day(-29));
  const [to, setTo] = useState(() => day(0));
  const [range, setRange] = useState(() => ({ from: day(-29), to: day(0) }));
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedResult<PromotionRedemptionRow> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setData(null);
    setError("");
    const params = new URLSearchParams({
      campaignId,
      page: String(page),
      pageSize: "20",
      from: new Date(`${range.from}T00:00:00+08:00`).toISOString(),
      to: new Date(new Date(`${range.to}T00:00:00+08:00`).getTime() + 86400000).toISOString(),
    });
    fetchApi<PaginatedResult<PromotionRedemptionRow>>(`/admin/promotion/redemptions?${params}`)
      .then((r) => {
        if (alive) setData(r);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [campaignId, page, range]);
  return (
    <section>
      <h3>核销对账</h3>
      <p className={styles.muted}>
        按商家与北京时间日期汇总核销次数，每次最多查询 370 天。
      </p>
      <form
        className={styles.toolbar}
        style={{ marginTop: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (from && to && from <= to) {
            setPage(1);
            setRange({ from, to });
          }
        }}
      >
        <label>
          开始日期{" "}
          <input
            aria-label="对账开始日期"
            type="date"
            required
            max={to}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          结束日期{" "}
          <input
            aria-label="对账结束日期"
            type="date"
            required
            min={from}
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button className="ui-button ui-button--secondary" disabled={!from || !to || from > to}>
          查询对账
        </button>
      </form>
      {error ? (
        <p role="alert">{error}</p>
      ) : !data ? (
        <p className={styles.empty}>加载对账记录…</p>
      ) : !data.items.length ? (
        <p className={styles.empty}>这段时间没有核销记录。</p>
      ) : (
        <>
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>商家</th>
                  <th>核销数</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={`${r.merchantId}-${r.day}`}>
                    <td>{r.day}</td>
                    <td>{r.merchantName}</td>
                    <td>{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.totalPages > 1 && (
            <AdminPagination
              className={cx(adminStyles, "admin-pagination")}
              page={page}
              totalPages={data.totalPages}
              total={data.total}
              unit="条记录"
              onPageChange={setPage}
            />
          )}
        </>
      )}
    </section>
  );
}

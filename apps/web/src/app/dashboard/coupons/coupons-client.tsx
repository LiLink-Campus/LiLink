"use client";

import { useEffect, useState } from "react";
import { fetchMyCoupons, type MyCoupon } from "../../../lib/api";

const STATUS_LABELS: Record<string, string> = {
  ISSUED: "可用",
  REDEEMED: "已使用",
  EXPIRED: "已过期",
  VOID: "已作废",
};

function formatExpiry(iso: string | null) {
  if (!iso) return "长期有效";
  return `${new Date(iso).toLocaleDateString("zh-CN")} 前有效`;
}

export function CouponsClient() {
  const [coupons, setCoupons] = useState<MyCoupon[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchMyCoupons()
      .then((result) => {
        if (active) setCoupons(result.items);
      })
      .catch((caught) => {
        if (active) {
          setError(caught instanceof Error ? caught.message : "加载失败");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <main className="app-page-shell v2-page-shell">
        <p style={{ padding: "2rem" }}>加载中……</p>
      </main>
    );
  }
  if (error) {
    return (
      <main className="app-page-shell v2-page-shell">
        <p style={{ padding: "2rem" }}>{error}</p>
      </main>
    );
  }

  const issued = coupons?.filter((coupon) => coupon.status === "ISSUED") ?? [];
  const archived =
    coupons?.filter((coupon) => coupon.status !== "ISSUED") ?? [];

  return (
    <main className="app-page-shell v2-page-shell">
      <header className="me-hero">
        <h1 className="me-hero-name">我的优惠券</h1>
        <p className="me-hero-email">向商家出示核销码即可使用</p>
      </header>

      <section className="me-group">
        <div className="me-card-preview-header">
          <h3>可用（{issued.length}）</h3>
        </div>
        {issued.length === 0 ? (
          <p style={{ padding: "0 1rem" }}>
            暂无可用优惠券。完善资料并报名匹配周期后即可获得。
          </p>
        ) : (
          issued.map((coupon) => (
            <div key={coupon.id} className="me-card-preview">
              <div className="me-card-preview-header">
                <h3>{coupon.title}</h3>
                <p>
                  {coupon.merchantName} · {coupon.benefitText}
                </p>
              </div>
              <div className="me-card-preview-content">
                <div className="me-card-field">
                  <span className="me-card-label">核销码</span>
                  <span className="me-card-value">{coupon.code}</span>
                </div>
                <div className="me-card-field">
                  <span className="me-card-label">有效期</span>
                  <span className="me-card-value">
                    {formatExpiry(coupon.expiresAt)}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      {archived.length > 0 && (
        <section className="me-group">
          <div className="me-card-preview-header">
            <h3>已使用 / 已过期（{archived.length}）</h3>
          </div>
          {archived.map((coupon) => (
            <div key={coupon.id} className="me-card-field">
              <span className="me-card-label">
                {coupon.title} · {coupon.merchantName}
              </span>
              <span className="me-card-value">
                {STATUS_LABELS[coupon.status] ?? coupon.status}
              </span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

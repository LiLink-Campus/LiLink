"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ClipboardIcon } from "../_components/icons";
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

function CouponCard({
  coupon,
  archived = false,
}: {
  coupon: MyCoupon;
  archived?: boolean;
}) {
  return (
    <article
      className={`coupons-card${archived ? " is-archived" : ""}`}
      aria-label={coupon.title}
    >
      <div className="coupons-card-top">
        <div className="coupons-card-main">
          <p className="coupons-card-title">{coupon.title}</p>
          <p className="coupons-card-merchant">{coupon.merchantName}</p>
          {!archived && coupon.benefitText ? (
            <p className="coupons-card-benefit">{coupon.benefitText}</p>
          ) : null}
        </div>
        <span className={`coupons-badge${archived ? " is-muted" : ""}`}>
          {archived
            ? (STATUS_LABELS[coupon.status] ?? coupon.status)
            : "可用"}
        </span>
      </div>

      {!archived ? (
        <>
          <div className="coupons-code-block">
            <span className="coupons-code-label">核销码</span>
            <code className="coupons-code">{coupon.code}</code>
          </div>
          <div className="coupons-meta">
            <span className="coupons-meta-label">有效期</span>
            <span>{formatExpiry(coupon.expiresAt)}</span>
          </div>
        </>
      ) : null}
    </article>
  );
}

function CouponsEmptyState() {
  return (
    <div className="coupons-empty" role="status">
      <span className="coupons-empty-icon" aria-hidden="true">
        <ClipboardIcon />
      </span>
      <p className="coupons-empty-title">暂无可用优惠券</p>
      <p className="coupons-empty-desc">
        完善资料并报名匹配周期后，系统会自动为你发放商家优惠。
      </p>
    </div>
  );
}

function CouponsPanel({
  title,
  description,
  count,
  children,
  muted = false,
}: {
  title: string;
  description: string;
  count: number;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <section
      className={`coupons-panel${muted ? " is-muted" : ""}`}
      aria-label={title}
    >
      <div className="coupons-panel-head">
        <div className="coupons-panel-head-main">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="coupons-panel-count">{count} 张</span>
      </div>
      {children}
    </section>
  );
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
      <div className="app-page-shell v2-page-shell coupons-page">
        <div className="me-state">
          <span className="me-state-spinner" />
          <span>加载中……</span>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="app-page-shell v2-page-shell coupons-page">
        <div className="me-state is-error">{error}</div>
      </div>
    );
  }

  const issued = coupons?.filter((coupon) => coupon.status === "ISSUED") ?? [];
  const archived =
    coupons?.filter((coupon) => coupon.status !== "ISSUED") ?? [];

  return (
    <div className="app-page-shell v2-page-shell coupons-page">
      <header className="v2-page-header coupons-header">
        <span className="v2-page-header-eyebrow">
          <ClipboardIcon className="coupons-header-icon" />
          商家优惠
        </span>
        <h1>我的优惠券</h1>
        <p>向商家出示核销码即可使用</p>
      </header>

      <CouponsPanel
        title="可用优惠券"
        description="到店消费时，向商家出示下方核销码即可抵扣"
        count={issued.length}
      >
        {issued.length === 0 ? (
          <CouponsEmptyState />
        ) : (
          <div className="coupons-list">
            {issued.map((coupon) => (
              <CouponCard key={coupon.id} coupon={coupon} />
            ))}
          </div>
        )}
      </CouponsPanel>

      {archived.length > 0 ? (
        <CouponsPanel
          title="历史记录"
          description="已使用或过期的优惠券"
          count={archived.length}
          muted
        >
          <div className="coupons-list">
            {archived.map((coupon) => (
              <CouponCard key={coupon.id} coupon={coupon} archived />
            ))}
          </div>
        </CouponsPanel>
      ) : null}
    </div>
  );
}

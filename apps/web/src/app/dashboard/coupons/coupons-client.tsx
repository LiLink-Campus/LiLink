"use client";

import { useEffect, useState, useRef, Fragment, type ReactNode } from "react";
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
  onShowCode,
}: {
  coupon: MyCoupon;
  archived?: boolean;
  onShowCode?: () => void;
}) {
  const showBenefit =
    !archived &&
    Boolean(coupon.benefitText) &&
    coupon.benefitText !== coupon.title;

  return (
    <article
      className={`coupons-card${archived ? " is-archived" : ""}`}
      aria-label={coupon.title}
    >
      <div className="coupons-card-main">
        <div className="coupons-card-head">
          <p className="coupons-card-title">{coupon.title}</p>
        </div>
        <div className="coupons-card-meta">
          <span className="coupons-card-merchant">{coupon.merchantName}</span>
          {!archived ? (
            <>
              <span className="coupons-card-meta-sep" aria-hidden="true">
                ·
              </span>
              <span className="coupons-card-expiry">
                {formatExpiry(coupon.expiresAt)}
              </span>
            </>
          ) : null}
        </div>
        {showBenefit ? (
          <p className="coupons-card-benefit">
            {coupon.benefitText.split(" ｜ ").map((tier, index) => (
              <Fragment key={index}>
                {index > 0 ? (
                  <span className="coupons-card-benefit-sep" aria-hidden="true">
                    ｜
                  </span>
                ) : null}
                <span className="coupons-card-benefit-tier">{tier}</span>
              </Fragment>
            ))}
          </p>
        ) : null}
      </div>

      <div className="coupons-card-actions">
        <span className={`coupons-badge${archived ? " is-muted" : ""}`}>
          {archived
            ? (STATUS_LABELS[coupon.status] ?? coupon.status)
            : "可用"}
        </span>
        {!archived ? (
          <button
            type="button"
            className="ui-button ui-button--primary coupons-use-btn"
            onClick={onShowCode}
          >
            查看核销码
          </button>
        ) : null}
      </div>
    </article>
  );
}

function CouponCodeDialog({
  coupon,
  onClose,
}: {
  coupon: MyCoupon | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (coupon) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [coupon]);

  if (!coupon) return null;

  return (
    <dialog
      ref={dialogRef}
      className="coupons-dialog"
      onClose={onClose}
      aria-labelledby="coupons-dialog-title"
    >
      <div className="coupons-dialog-inner">
        <div className="coupons-dialog-header">
          <h2 id="coupons-dialog-title" className="coupons-dialog-title">
            {coupon.title}
          </h2>
          <p className="coupons-dialog-merchant">{coupon.merchantName}</p>
        </div>
        <div className="coupons-dialog-body">
          <div className="coupons-code-block">
            <span className="coupons-code-label">核销码</span>
            <code className="coupons-code">{coupon.code}</code>
          </div>
          <p className="coupons-dialog-hint">请向店员出示此核销码</p>
          <button
            className="ui-button ui-button--primary coupons-dialog-close"
            onClick={onClose}
            type="button"
          >
            完成
          </button>
        </div>
      </div>
    </dialog>
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
  const [selectedCoupon, setSelectedCoupon] = useState<MyCoupon | null>(null);

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
              <CouponCard 
                key={coupon.id} 
                coupon={coupon} 
                onShowCode={() => setSelectedCoupon(coupon)}
              />
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

      <CouponCodeDialog 
        coupon={selectedCoupon} 
        onClose={() => setSelectedCoupon(null)} 
      />
    </div>
  );
}

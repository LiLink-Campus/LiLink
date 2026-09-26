"use client";
import { dcx } from "../_lib/dashboard-class-names";
import type { MyCoupon } from "@/lib/api";

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

export function CouponCard({
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
      className={dcx(`coupons-card${archived ? " is-archived" : ""}`)}
      aria-label={coupon.title}
    >
      <div className={dcx("coupons-card-main")}>
        <div className={dcx("coupons-card-head")}>
          <p className={dcx("coupons-card-title")}>{coupon.title}</p>
        </div>
        <div className={dcx("coupons-card-meta")}>
          <span className={dcx("coupons-card-merchant")}>{coupon.merchantName}</span>
          {!archived ? (
            <>
              <span className={dcx("coupons-card-meta-sep")} aria-hidden="true">
                ·
              </span>
              <span className={dcx("coupons-card-expiry")}>
                {formatExpiry(coupon.expiresAt)}
              </span>
            </>
          ) : null}
        </div>
        {showBenefit ? (
          <ul className={dcx("coupons-card-benefit-list")}>
            {coupon.benefitText.split(" ｜ ").map((tier, index) => (
              <li key={index} className={dcx("coupons-card-benefit-tier")}>
                {tier}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className={dcx("coupons-card-actions")}>
        <span className={dcx(`coupons-badge${archived ? " is-muted" : ""}`)}>
          {archived
            ? (STATUS_LABELS[coupon.status] ?? coupon.status)
            : "可用"}
        </span>
        {!archived ? (
          <button
            type="button"
            className={dcx("ui-button ui-button--primary coupons-use-btn")}
            onClick={onShowCode}
          >
            查看核销码
          </button>
        ) : null}
      </div>
    </article>
  );
}

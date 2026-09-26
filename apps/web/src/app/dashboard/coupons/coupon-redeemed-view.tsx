"use client";
import { dcx } from "../_lib/dashboard-class-names";
import { formatYuan } from "@/lib/format";
import type { MerchantPromotionBlock } from "@lilink/shared";
import type { CouponStatusResponse } from "@/lib/api";

function PromotionBlock({ block }: { block: MerchantPromotionBlock }) {
  if (block.type === "TEXT") {
    return (
      <div className={dcx("coupons-redeemed-promo-block")}>
        <p>{block.text}</p>
      </div>
    );
  }
  return (
    <div className={dcx("coupons-redeemed-promo-block")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={block.imageUrl}
        alt={block.caption ?? (block.type === "QRCODE" ? "商家二维码" : "推广图片")}
        className={dcx("coupons-redeemed-promo-img")}
      />
      {block.caption ? (
        <p className={dcx("coupons-redeemed-promo-caption")}>{block.caption}</p>
      ) : null}
    </div>
  );
}

// -------------------------------------------------------------------
// Success view (coupon has been REDEEMED)
// -------------------------------------------------------------------

export function RedeemedView({
  applied,
  merchantPromotion,
  onClose,
}: {
  applied: CouponStatusResponse["applied"];
  merchantPromotion: MerchantPromotionBlock[] | undefined;
  onClose: () => void;
}) {
  const hasDiscount = applied && applied.discountAmount > 0;
  const hasGift = applied?.gift;

  return (
    <div className={dcx("coupons-redeemed-success")}>
      <span className={dcx("coupons-redeemed-icon")} aria-hidden="true">
        ✅
      </span>
      <p className={dcx("coupons-redeemed-title")}>核销成功</p>

      {hasDiscount ? (
        <p className={dcx("coupons-redeemed-applied")}>
          {applied.orderAmount != null ? (
            <>消费 {formatYuan(applied.orderAmount)} 元，</>
          ) : null}
          优惠 {formatYuan(applied.discountAmount)} 元
        </p>
      ) : null}

      {hasGift ? (
        <p className={dcx("coupons-redeemed-applied")}>赠品：{applied!.gift}</p>
      ) : null}

      {merchantPromotion && merchantPromotion.length > 0 ? (
        <div className={dcx("coupons-redeemed-promotion")}>
          {merchantPromotion.map((block, idx) => (
            <PromotionBlock key={idx} block={block} />
          ))}
        </div>
      ) : null}

      <button
        className={dcx("ui-button ui-button--primary coupons-dialog-close")}
        onClick={onClose}
        type="button"
      >
        完成
      </button>
    </div>
  );
}

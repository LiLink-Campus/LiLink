import type { RedeemResponse } from "@/lib/api";

const messages = {
  SUCCESS: "核销成功",
  ALREADY_USED: "该券已使用。",
  GROUP_USED: "已使用同组其他优惠。",
  EXPIRED_CODE: "二维码已过期，请让用户刷新后重试。",
  INVALID: "无效的核销码。",
};
export function RedeemResult({ response }: { response: RedeemResponse }) {
  return (
    <div className="mc-redeem-body">
      <div
        className={`mc-result ${response.result === "SUCCESS" ? "is-success" : "is-warning"}`}
        role="status"
      >
        <p className="mc-result-label">{messages[response.result]}</p>
        {response.coupon && (
          <div className="mc-coupon">
            <p className="mc-coupon-title">{response.coupon.title}</p>
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {response.coupon.benefitText}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

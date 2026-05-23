"use client";

import { FormEvent, ReactNode, useState } from "react";
import { Button, FormMessage, Input } from "@/components/ui";
import {
  redeemCoupon,
  type PrepareRedeemOk,
  type RedeemResponse,
} from "../../../lib/api";
import "../merchant.css";

// ── Icons ────────────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg
      className="mc-result-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg
      className="mc-result-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.5 21 19H3z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg
      className="mc-result-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6" />
      <path d="m15 9-6 6" />
    </svg>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatYuan(cents: number): string {
  return (cents / 100).toFixed(2);
}

// Maps redeem result to display metadata.
const RESULT_META: Record<
  RedeemResponse["result"],
  { cls: string; label: string; icon: ReactNode; hint?: string }
> = {
  SUCCESS: { cls: "is-success", label: "核销成功", icon: <CheckIcon /> },
  ALREADY_USED: {
    cls: "is-warning",
    label: "该券已使用",
    icon: <WarnIcon />,
  },
  INVALID: { cls: "is-error", label: "无效券码", icon: <CrossIcon /> },
  NEED_AMOUNT: {
    cls: "is-warning",
    label: "请输入消费金额",
    icon: <WarnIcon />,
    hint: "该券为满减/折扣/满赠券，填写消费金额后再核销。",
  },
  BELOW_THRESHOLD: {
    cls: "is-warning",
    label: "未达使用门槛",
    icon: <WarnIcon />,
    hint: "本次消费金额未达到下方任一档门槛，无法核销。",
  },
};

// ── Props ────────────────────────────────────────────────────────────────────

export type RedeemConfirmProps = {
  /** Successful prepare response (result === "OK"). */
  prepare: PrepareRedeemOk;
  /**
   * Called after a successful redemption so the parent can reset.
   * Receives the full redeem response so callers can display applied results.
   */
  onSuccess?: (result: RedeemResponse) => void;
};

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Shared confirm step used by both the scan (/r/[code]) and manual
 * (/merchant/redeem) entry paths.
 *
 * Renders coupon info from the prepare response; prompts for an order amount
 * when needAmount is true; calls POST /merchant/redeem on confirm; shows
 * success / failure inline. No merchant promotion is ever rendered here.
 */
export function RedeemConfirm({ prepare, onSuccess }: RedeemConfirmProps) {
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<RedeemResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    let orderAmount: number | undefined;
    if (prepare.needAmount) {
      const trimmed = amount.trim();
      if (!trimmed) {
        setError("请输入消费金额。");
        return;
      }
      const yuan = Number(trimmed);
      if (!Number.isFinite(yuan) || yuan < 0) {
        setError("消费金额无效，请输入大于等于 0 的数字。");
        return;
      }
      orderAmount = Math.round(yuan * 100);
    }

    setPending(true);
    setError(null);
    setResult(null);

    try {
      const response = await redeemCoupon({
        redeemTicket: prepare.redeemTicket!,
        orderAmount,
      });
      setResult(response);
      if (response.result === "SUCCESS") {
        onSuccess?.(response);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "核销失败，请重试。");
    } finally {
      setPending(false);
    }
  }

  const meta = result ? RESULT_META[result.result] : null;
  const applied = result?.result === "SUCCESS" ? result.applied : null;

  return (
    <div className="mc-redeem-body">
      {/* Coupon preview from prepare */}
      {prepare.coupon && (
        <div className="mc-coupon mc-coupon-preview">
          <p className="mc-coupon-title">{prepare.coupon.title}</p>
          <p>{prepare.coupon.benefitText}</p>
          <p className="mc-coupon-face">
            面值 {formatYuan(prepare.coupon.faceValue)} 元
          </p>
          {prepare.coupon.userDisplayName && (
            <p className="mc-coupon-holder">
              持券人：{prepare.coupon.userDisplayName}
            </p>
          )}
        </div>
      )}

      <form className="mc-form" onSubmit={confirm}>
        {prepare.needAmount && (
          <Input
            border="subtle"
            className="mc-amount-input"
            controlSize="lg"
            radius="sm"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="消费金额（元）"
            inputMode="decimal"
            type="number"
            min={0}
            step="0.01"
            autoComplete="off"
          />
        )}
        <Button
          block
          elevation="flat"
          shape="rounded"
          size="lg"
          type="submit"
          disabled={pending}
        >
          {pending ? "核销中……" : "确认核销"}
        </Button>
      </form>

      {error && <FormMessage>{error}</FormMessage>}

      {meta && result && (
        <div className={`mc-result ${meta.cls}`}>
          {meta.icon}
          <span className="mc-result-label">{meta.label}</span>

          {meta.hint && <p className="mc-result-hint">{meta.hint}</p>}

          {result.coupon && (
            <div className="mc-coupon">
              <p className="mc-coupon-title">{result.coupon.title}</p>
              <p>{result.coupon.benefitText}</p>

              {applied &&
                (applied.gift ? (
                  <p className="mc-coupon-apply">赠品：{applied.gift}</p>
                ) : applied.discountAmount > 0 ? (
                  <p className="mc-coupon-apply">
                    应减 {formatYuan(applied.discountAmount)} 元
                  </p>
                ) : null)}

              {applied && applied.orderAmount != null && (
                <p className="mc-coupon-order">
                  消费 {formatYuan(applied.orderAmount)} 元
                </p>
              )}

              <p className="mc-coupon-face">
                面值 {formatYuan(result.coupon.faceValue)} 元
              </p>
              {result.coupon.userDisplayName && (
                <p className="mc-coupon-holder">
                  持券人：{result.coupon.userDisplayName}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

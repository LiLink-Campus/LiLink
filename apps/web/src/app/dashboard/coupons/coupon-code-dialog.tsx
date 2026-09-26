"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { generateTotpToken, formatRedeemCode, COUPON_TOTP } from "@lilink/shared";
import { getCouponRedeemSecret, getCouponStatus, isApiRequestError, type MyCoupon, type CouponRedeemSecret, type CouponStatusResponse } from "@/lib/api";
import { getClientWebOrigin } from "@/lib/api-base-url";
import { dcx } from "../_lib/dashboard-class-names";
import { RedeemedView } from "./coupon-redeemed-view";
const QrCode = dynamic(() => import("@/components/qr-code").then(m => m.QrCode), { ssr: false });

type DialogState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "not-redeemable" }
  | { phase: "active"; secret: CouponRedeemSecret; token: string; secs: number }
  | { phase: "redeemed"; status: CouponStatusResponse }
  | { phase: "expired-or-void"; reason: "EXPIRED" | "VOID" };

export function CouponCodeDialog({ coupon, onClose, onStatus }: {
  coupon: MyCoupon;
  onClose: () => void;
  onStatus: (coupon: MyCoupon, status: CouponStatusResponse) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<DialogState>({ phase: "loading" });
  const [pollError, setPollError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => { dialogRef.current?.showModal(); }, []);
  useEffect(() => {
    let disposed = false;
    let terminal = false;
    let secret: CouponRedeemSecret | null = null;
    let request: AbortController | null = null;
    let tickTimer: ReturnType<typeof setInterval> | undefined;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    setState({ phase: "loading" });
    setPollError(null);
    const pause = () => {
      clearInterval(tickTimer);
      clearTimeout(pollTimer);
      tickTimer = undefined;
      pollTimer = undefined;
      request?.abort();
      request = null;
    };
    const tick = () => {
      if (!secret || terminal || disposed) return;
      const now = Date.now();
      setState({ phase: "active", secret, token: generateTotpToken(secret.secret, now), secs: COUPON_TOTP.period - Math.floor(now / 1000) % COUPON_TOTP.period });
    };
    const schedulePoll = () => {
      if (!disposed && !terminal && !document.hidden && pollTimer == null) {
        pollTimer = setTimeout(() => { pollTimer = undefined; void poll(); }, Math.min(20_000, 2500 * 2 ** failures));
      }
    };
    const poll = async () => {
      if (request || disposed || terminal || document.hidden) return;
      const controller = new AbortController();
      request = controller;
      try {
        const result = await getCouponStatus(coupon.id, controller.signal);
        if (disposed || controller.signal.aborted) return;
        failures = 0;
        setPollError(null);
        if (result.status !== "ISSUED") {
          terminal = true;
          pause();
          if (result.status === "REDEEMED") setState({ phase: "redeemed", status: result });
          else setState({ phase: "expired-or-void", reason: result.status });
          onStatus(coupon, result);
        }
      } catch (error) {
        if (disposed || controller.signal.aborted) return;
        if (isApiRequestError(error) && error.status === 401) {
          terminal = true;
          pause();
          setState({ phase: "error", message: "登录状态已失效，请重新登录。" });
        } else {
          failures = Math.min(failures + 1, 3);
          setPollError("核销状态暂时无法更新，正在自动重试。");
        }
      } finally {
        if (request === controller) request = null;
        if (!controller.signal.aborted) schedulePoll();
      }
    };
    const resume = async () => {
      if (document.hidden) { pause(); return; }
      if (disposed || terminal || request) return;
      if (!secret) {
        const controller = new AbortController();
        request = controller;
        try {
          const result = await getCouponRedeemSecret(coupon.id, controller.signal);
          if (disposed || controller.signal.aborted) return;
          secret = result;
        } catch (error) {
          if (disposed || controller.signal.aborted) return;
          setState(isApiRequestError(error) && error.status === 404
            ? { phase: "not-redeemable" }
            : { phase: "error", message: error instanceof Error ? error.message : "加载失败" });
          return;
        } finally { if (request === controller) request = null; }
      }
      tick();
      if (tickTimer == null) tickTimer = setInterval(tick, 1000);
      schedulePoll();
    };
    const onVisibility = () => { void resume(); };
    void resume();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      disposed = true;
      pause();
      secret = null;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [coupon, onStatus, retry]);

  const origin = getClientWebOrigin();

  function buildQrValue(code: string, token: string) {
    return `${origin}/r/${code}#t=${token}`;
  }

  return (
    <dialog
      ref={dialogRef}
      className={dcx("coupons-dialog")}
      onClose={onClose}
      aria-labelledby="coupons-dialog-title"
    >
      <div className={dcx("coupons-dialog-inner")}>
        <div className={dcx("coupons-dialog-header")}>
          <button type="button" aria-label="关闭优惠券" onClick={onClose}>×</button>
          <h2 id="coupons-dialog-title" className={dcx("coupons-dialog-title")}>
            {coupon.title}
          </h2>
          <p className={dcx("coupons-dialog-merchant")}>{coupon.merchantName}</p>
        </div>

        <div className={dcx("coupons-dialog-body")}>
          {pollError && <p role="status">{pollError}</p>}
          {state.phase === "loading" ? (
            <div className={dcx("me-state")}>
              <span className={dcx("me-state-spinner")} />
              <span>加载中……</span>
            </div>
          ) : state.phase === "error" ? (
            <div>
            <p
              className={dcx("coupons-dialog-hint")}
              style={{ color: "var(--color-danger)" }}
            >
              {state.message}
            </p>
            <button type="button" onClick={() => setRetry(value => value + 1)}>重新加载核销码</button>
            </div>
          ) : state.phase === "not-redeemable" ? (
            <p className={dcx("coupons-dialog-hint")}>
              该券暂不支持扫码核销，请向店员报出券码。
            </p>
          ) : state.phase === "redeemed" ? (
            <RedeemedView
              applied={state.status.applied}
              merchantPromotion={state.status.merchantPromotion}
              onClose={onClose}
            />
          ) : state.phase === "expired-or-void" ? (
            <div className={dcx("coupons-redeemed-success")}>
              <span className={dcx("coupons-redeemed-icon")} aria-hidden="true">
                {state.reason === "EXPIRED" ? "⏰" : "🚫"}
              </span>
              <p className={dcx("coupons-redeemed-title")}>
                {state.reason === "EXPIRED" ? "优惠券已过期" : "优惠券已作废"}
              </p>
              <p className={dcx("coupons-dialog-hint")}>该优惠券无法再使用，请关闭。</p>
              <button
                className={dcx("ui-button ui-button--primary coupons-dialog-close")}
                onClick={onClose}
                type="button"
              >
                关闭
              </button>
            </div>
          ) : (
            // phase === "active"
            <>
              <div  className={dcx("coupons-showcode-qr")}>
                <QrCode value={buildQrValue(state.secret.code, state.token)} size={180} />
              </div>

              <div className={dcx("coupons-showcode-code")}>
                <span className={dcx("coupons-showcode-code-label")}>核销码</span>
                <code className={dcx("coupons-showcode-code-value")}>
                  {formatRedeemCode(state.secret.code, state.token)}
                </code>
                <span className={dcx("coupons-showcode-countdown")}>
                  {state.secs}
                  <span className={dcx("coupons-showcode-countdown-secs")}> 秒</span>
                  后刷新
                </span>
              </div>

              <p className={dcx("coupons-dialog-hint")}>请向店员出示此核销码</p>

              <button
                className={dcx("ui-button ui-button--primary coupons-dialog-close")}
                onClick={onClose}
                type="button"
              >
                完成
              </button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}

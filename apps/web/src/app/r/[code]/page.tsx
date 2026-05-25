"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ApiRequestError,
  prepareRedeem,
  type PrepareRedeemOk,
  type PrepareRedeemResponse,
  type RedeemResponse,
} from "@/lib/api";
import { formatYuan } from "@/lib/format";
import { RedeemConfirm } from "../../merchant/_components/RedeemConfirm";
import "../../merchant/merchant.css";

type PageState =
  | { phase: "loading" }
  | { phase: "no-totp" }
  | { phase: "prepare-error"; message: string }
  | { phase: "prepare-fail"; result: Exclude<PrepareRedeemResponse["result"], "OK"> }
  | { phase: "ready"; prepare: PrepareRedeemOk }
  | { phase: "done"; redeemResult: RedeemResponse };

const PREPARE_FAIL_MESSAGES: Record<
  Exclude<PrepareRedeemResponse["result"], "OK">,
  string
> = {
  EXPIRED_CODE: "二维码已过期，请让用户刷新后重试。",
  ALREADY_USED: "该券已使用。",
  INVALID: "无效的核销码。",
};

/** Success view shown after scan-confirm redemption (spec §9.2). */
function ScanSuccessView({ redeemResult }: { redeemResult: RedeemResponse }) {
  const applied = redeemResult.applied;
  return (
    <div className="mc-redeem-body">
      <div className="mc-result is-success">
        <span className="mc-result-label">✓ 核销成功</span>
        {applied && (
          <div className="mc-coupon">
            {redeemResult.coupon && (
              <p className="mc-coupon-title">{redeemResult.coupon.title}</p>
            )}
            {applied.gift ? (
              <p className="mc-coupon-apply">赠品：{applied.gift}</p>
            ) : applied.discountAmount > 0 ? (
              <p className="mc-coupon-apply">
                应减 {formatYuan(applied.discountAmount)} 元
              </p>
            ) : null}
            {applied.orderAmount != null && (
              <p className="mc-coupon-order">
                消费 {formatYuan(applied.orderAmount)} 元
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Scan confirm page — reached when a merchant scans a user's QR code.
 *
 * URL structure: /r/<code>#t=<totp>
 * The TOTP lives in the hash fragment so it is never sent to the server in
 * the initial page request. On load we extract it from location.hash, call
 * prepareRedeem, then render RedeemConfirm.
 *
 * If the merchant is not logged in (401) we redirect to
 * /merchant/login?next=/r/<code>. After login the page shows "请重新出示"
 * because the hash fragment is dropped on redirect — this is expected and
 * handled by the no-totp state below.
 */
export default function ScanConfirmPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const [state, setState] = useState<PageState>({ phase: "loading" });

  useEffect(() => {
    const code = params.code ?? "";

    // Extract totp from hash fragment (#t=<token>).
    const hash = window.location.hash; // e.g. "#t=123456"
    const totp = hash.startsWith("#t=") ? hash.slice(3) : null;

    if (!totp) {
      setState({ phase: "no-totp" });
      return;
    }

    let active = true;

    prepareRedeem({ code, totp })
      .then((res) => {
        if (!active) return;
        if (res.result === "OK") {
          setState({ phase: "ready", prepare: res });
        } else {
          setState({ phase: "prepare-fail", result: res.result });
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof ApiRequestError && err.status === 401) {
          // Not logged in; redirect to merchant login.
          router.push(
            "/merchant/login?next=" + encodeURIComponent("/r/" + code),
          );
          return;
        }
        setState({
          phase: "prepare-error",
          message:
            err instanceof Error ? err.message : "请求失败，请重试。",
        });
      });

    return () => {
      active = false;
    };
  }, [params.code, router]);

  if (state.phase === "loading") {
    return (
      <div className="mc-shell">
        <p className="mc-loading">加载中……</p>
      </div>
    );
  }

  if (state.phase === "no-totp") {
    return (
      <div className="mc-shell">
        <div className="mc-redeem-body">
          <div className="mc-result is-warning">
            <span className="mc-result-label">请重新出示二维码</span>
            <p className="mc-result-hint">
              请让用户重新出示二维码并再次扫码。
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (state.phase === "prepare-error") {
    return (
      <div className="mc-shell">
        <div className="mc-redeem-body">
          <div className="mc-result is-error">
            <span className="mc-result-label">核销失败</span>
            <p className="mc-result-hint">{state.message}</p>
          </div>
        </div>
      </div>
    );
  }

  if (state.phase === "prepare-fail") {
    return (
      <div className="mc-shell">
        <div className="mc-redeem-body">
          <div className="mc-result is-warning">
            <span className="mc-result-label">
              {PREPARE_FAIL_MESSAGES[state.result]}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (state.phase === "done") {
    return (
      <div className="mc-shell">
        <ScanSuccessView redeemResult={state.redeemResult} />
      </div>
    );
  }

  // phase === "ready"
  return (
    <div className="mc-shell">
      <RedeemConfirm
        prepare={state.prepare}
        onSuccess={(r) => setState({ phase: "done", redeemResult: r })}
      />
    </div>
  );
}

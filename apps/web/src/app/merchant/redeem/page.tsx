"use client";

import { FormEvent, useEffect, useState } from "react";
import { parseRedeemCode } from "@lilink/shared";
import { Button, FormMessage, Input } from "@/components/ui";
import {
  ApiRequestError,
  fetchMerchantMe,
  merchantLogout,
  prepareRedeem,
  type MerchantSessionUser,
  type PrepareRedeemOk,
  type PrepareRedeemResponse,
  type RedeemResponse,
} from "../../../lib/api";
import { RedeemConfirm } from "../_components/RedeemConfirm";
import "../merchant.css";

type PageState =
  | { phase: "idle" }
  | { phase: "preparing" }
  | { phase: "prepare-fail"; result: Exclude<PrepareRedeemResponse["result"], "OK">; message: string }
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

/** Convert cents to yuan string, e.g. 100 → "1.00". */
function formatYuan(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Merchant-facing success view showing the applied discount/amount/gift (spec §9.2). */
function RedeemSuccessView({
  redeemResult,
  onContinue,
}: {
  redeemResult: RedeemResponse;
  onContinue: () => void;
}) {
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
      <Button
        block
        elevation="flat"
        shape="rounded"
        size="lg"
        type="button"
        onClick={onContinue}
      >
        继续核销
      </Button>
    </div>
  );
}

export default function MerchantRedeemPage() {
  const [me, setMe] = useState<MerchantSessionUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [input, setInput] = useState("");
  const [formatError, setFormatError] = useState<string | null>(null);
  const [pageState, setPageState] = useState<PageState>({ phase: "idle" });

  useEffect(() => {
    let active = true;
    fetchMerchantMe()
      .then((response) => {
        if (active) setMe(response.merchantUser);
      })
      .catch(() => {
        if (active) window.location.href = "/merchant/login";
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = input.trim();
    if (!raw) return;

    // Parse "<code>-<totp>" using the shared helper.
    const parsed = parseRedeemCode(raw);
    if (!parsed) {
      setFormatError(
        "格式不正确，请输入「券码-6位验证码」，例如 AB23CD-123456。",
      );
      return;
    }

    setFormatError(null);
    setPageState({ phase: "preparing" });

    try {
      const res = await prepareRedeem({ code: parsed.code, totp: parsed.token });
      if (res.result === "OK") {
        setPageState({ phase: "ready", prepare: res });
      } else {
        setPageState({
          phase: "prepare-fail",
          result: res.result,
          message: PREPARE_FAIL_MESSAGES[res.result],
        });
      }
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        window.location.href = "/merchant/login";
        return;
      }
      setFormatError(err instanceof Error ? err.message : "请求失败，请重试。");
      setPageState({ phase: "idle" });
    }
  }

  function reset() {
    setInput("");
    setFormatError(null);
    setPageState({ phase: "idle" });
  }

  function logout() {
    void merchantLogout().finally(() => {
      window.location.href = "/merchant/login";
    });
  }

  if (checking) {
    return (
      <div className="mc-shell">
        <p className="mc-loading">加载中……</p>
      </div>
    );
  }
  if (!me) return null;

  return (
    <div className="mc-shell">
      <header className="mc-topbar">
        <span className="mc-topbar-name">{me.merchantName} · 核销</span>
        <Button type="button" variant="ghost" size="sm" onClick={logout}>
          退出
        </Button>
      </header>

      <main>
        {(pageState.phase === "idle" || pageState.phase === "preparing") && (
          <div className="mc-redeem-body">
            <form className="mc-form" onSubmit={submit}>
              <Input
                border="subtle"
                className="mc-code-input"
                controlSize="lg"
                radius="sm"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="输入核销码（格式：券码-验证码）"
                autoCapitalize="characters"
                autoComplete="off"
              />
              <Button
                block
                elevation="flat"
                shape="rounded"
                size="lg"
                type="submit"
                disabled={pageState.phase === "preparing" || !input.trim()}
              >
                {pageState.phase === "preparing" ? "查询中……" : "查询"}
              </Button>
            </form>
            {formatError && <FormMessage>{formatError}</FormMessage>}
          </div>
        )}

        {pageState.phase === "prepare-fail" && (
          <div className="mc-redeem-body">
            <div className="mc-result is-warning">
              <span className="mc-result-label">{pageState.message}</span>
            </div>
            <Button
              block
              elevation="flat"
              shape="rounded"
              size="lg"
              type="button"
              onClick={reset}
            >
              重新输入
            </Button>
          </div>
        )}

        {pageState.phase === "ready" && (
          <RedeemConfirm
            prepare={pageState.prepare}
            onSuccess={(r) => setPageState({ phase: "done", redeemResult: r })}
          />
        )}

        {pageState.phase === "done" && (
          <RedeemSuccessView
            redeemResult={pageState.redeemResult}
            onContinue={reset}
          />
        )}
      </main>
    </div>
  );
}

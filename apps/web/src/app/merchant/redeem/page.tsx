"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { COUPON_CODE_LENGTH } from "@lilink/shared";
import {
  fetchMerchantMe,
  merchantLogout,
  redeemCoupon,
  type MerchantSessionUser,
  type RedeemResponse,
} from "../../../lib/api";
import "../merchant.css";

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

const RESULT_META: Record<
  string,
  { cls: string; label: string; icon: ReactNode }
> = {
  SUCCESS: { cls: "is-success", label: "核销成功", icon: <CheckIcon /> },
  ALREADY_USED: { cls: "is-warning", label: "该券已使用", icon: <WarnIcon /> },
  INVALID: { cls: "is-error", label: "无效券码", icon: <CrossIcon /> },
};

export default function MerchantRedeemPage() {
  const [me, setMe] = useState<MerchantSessionUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<RedeemResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function redeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    if (normalized.length !== COUPON_CODE_LENGTH) {
      setError(`券码应为 ${COUPON_CODE_LENGTH} 位，请检查后重试。`);
      return;
    }
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const response = await redeemCoupon(normalized);
      setResult(response);
      if (response.result === "SUCCESS") setCode("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "核销失败，请重试。");
    } finally {
      setPending(false);
    }
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

  const meta = result ? RESULT_META[result.result] : null;

  return (
    <div className="mc-shell">
      <header className="mc-topbar">
        <span className="mc-topbar-name">{me.merchantName} · 核销</span>
        <button type="button" className="mc-btn-ghost" onClick={logout}>
          退出
        </button>
      </header>

      <main className="mc-redeem-body">
        <form className="mc-form" onSubmit={redeem}>
          <input
            className="mc-input mc-code-input"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="输入券码"
            autoCapitalize="characters"
            autoComplete="off"
          />
          <button
            className="mc-btn"
            type="submit"
            disabled={pending || !code.trim()}
          >
            {pending ? "核销中……" : "核销"}
          </button>
        </form>

        {error && <p className="mc-error">{error}</p>}

        {meta && (
          <div className={`mc-result ${meta.cls}`}>
            {meta.icon}
            <span className="mc-result-label">{meta.label}</span>
            {result?.result === "SUCCESS" && result.coupon && (
              <div className="mc-coupon">
                <p className="mc-coupon-title">{result.coupon.title}</p>
                <p>{result.coupon.benefitText}</p>
                <p className="mc-coupon-face">
                  面值 {(result.coupon.faceValue / 100).toFixed(2)} 元
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

        {result?.result === "SUCCESS" &&
          result.merchantPromotion &&
          result.merchantPromotion.length > 0 && (
            <section className="mc-promo">
              {result.merchantPromotion.map((block, index) => (
                <div className="mc-promo-card" key={`${block.type}-${index}`}>
                  {block.type === "TEXT" && (
                    <p className="mc-promo-text">{block.text}</p>
                  )}
                  {(block.type === "IMAGE" || block.type === "QRCODE") && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="mc-promo-img"
                        src={block.imageUrl}
                        alt={block.caption ?? "商家推广"}
                      />
                      {block.caption && (
                        <p className="mc-promo-caption">{block.caption}</p>
                      )}
                    </>
                  )}
                </div>
              ))}
            </section>
          )}
      </main>
    </div>
  );
}

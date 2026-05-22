"use client";

import { FormEvent, useEffect, useState } from "react";
import { COUPON_CODE_LENGTH } from "@lilink/shared";
import {
  fetchMerchantMe,
  merchantLogout,
  redeemCoupon,
  type MerchantSessionUser,
  type RedeemResponse,
} from "../../../lib/api";

const RESULT_BANNER: Record<string, { bg: string; label: string }> = {
  SUCCESS: { bg: "#27ae60", label: "核销成功" },
  ALREADY_USED: { bg: "#f39c12", label: "该券已使用" },
  INVALID: { bg: "#c0392b", label: "无效券码" },
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
      <main style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
        加载中……
      </main>
    );
  }
  if (!me) return null;

  const banner = result ? RESULT_BANNER[result.result] : null;

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <strong>{me.merchantName} · 核销</strong>
        <button type="button" onClick={logout} style={{ fontSize: "0.85rem" }}>
          退出
        </button>
      </header>

      <form
        onSubmit={redeem}
        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
      >
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="输入券码"
          autoCapitalize="characters"
          style={{
            padding: "1rem",
            fontSize: "1.4rem",
            textAlign: "center",
            letterSpacing: "0.15em",
          }}
        />
        <button
          type="submit"
          disabled={pending || !code.trim()}
          style={{ padding: "1rem", fontSize: "1.2rem", fontWeight: 700 }}
        >
          {pending ? "核销中……" : "核销"}
        </button>
      </form>

      {error && <p style={{ color: "#c0392b", marginTop: "1rem" }}>{error}</p>}

      {banner && (
        <div
          style={{
            marginTop: "1.5rem",
            padding: "1.5rem",
            borderRadius: 12,
            background: banner.bg,
            color: "#fff",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "1.4rem", fontWeight: 700, margin: 0 }}>
            {banner.label}
          </p>
          {result?.result === "SUCCESS" && result.coupon && (
            <div style={{ marginTop: "0.75rem" }}>
              <p style={{ margin: "0.25rem 0", fontSize: "1.1rem" }}>
                {result.coupon.title}
              </p>
              <p style={{ margin: "0.25rem 0" }}>{result.coupon.benefitText}</p>
              <p style={{ margin: "0.25rem 0" }}>
                面值 {(result.coupon.faceValue / 100).toFixed(2)} 元
              </p>
              {result.coupon.userDisplayName && (
                <p style={{ margin: "0.25rem 0", opacity: 0.85 }}>
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
          <section style={{ marginTop: "1.5rem", textAlign: "center" }}>
            {result.merchantPromotion.map((block, index) => (
              <div
                key={`${block.type}-${index}`}
                style={{ marginBottom: "1rem" }}
              >
                {block.type === "TEXT" && <p>{block.text}</p>}
                {(block.type === "IMAGE" || block.type === "QRCODE") && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={block.imageUrl}
                      alt={block.caption ?? "商家推广"}
                      style={{ maxWidth: 200, margin: "0 auto", display: "block" }}
                    />
                    {block.caption && <p>{block.caption}</p>}
                  </>
                )}
              </div>
            ))}
          </section>
        )}
    </main>
  );
}

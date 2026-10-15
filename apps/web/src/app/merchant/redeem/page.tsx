"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { parseRedeemCode } from "@lilink/shared";
import { Button, FormMessage, Input } from "@/components/ui";
import {
  ApiRequestError,
  fetchMerchantMe,
  merchantLogout,
  redeemCoupon,
  type MerchantSessionUser,
  type RedeemResponse,
} from "@/lib/api";
import { RedeemResult } from "../_components/redeem-result";
import "../merchant.css";

export default function MerchantRedeemPage() {
  const router = useRouter();
  const [me, setMe] = useState<MerchantSessionUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<RedeemResponse | null>(null);
  const busy = useRef(false);
  useEffect(() => {
    let active = true;
    fetchMerchantMe()
      .then((r) => {
        if (active) setMe(r.merchantUser);
      })
      .catch(() => {
        if (active) router.replace("/merchant/login");
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [router]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    const parsed = parseRedeemCode(input.trim());
    if (!parsed) {
      setError("格式不正确，请输入「券码-6位验证码」。");
      return;
    }
    busy.current = true;
    setPending(true);
    setError("");
    try {
      setResult(await redeemCoupon({ code: parsed.code, totp: parsed.token }));
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) {
        router.replace("/merchant/login");
        return;
      }
      setError(e instanceof Error ? e.message : "核销失败，请重试。");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  if (checking)
    return (
      <div className="mc-shell">
        <p className="mc-loading">加载中……</p>
      </div>
    );
  if (!me) return null;
  return (
    <div className="mc-shell">
      <header className="mc-topbar">
        <span className="mc-topbar-name">{me.merchantName} · 核销</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            void merchantLogout().finally(() => {
              router.replace("/merchant/login");
            });
          }}
        >
          退出
        </Button>
      </header>
      <main>
        {result ? (
          <>
            <RedeemResult response={result} />
            <div className="mc-redeem-body">
              <Button
                block
                type="button"
                onClick={() => {
                  setResult(null);
                  setInput("");
                }}
              >
                继续核销
              </Button>
            </div>
          </>
        ) : (
          <div className="mc-redeem-body">
            <p>请先现场确认优惠适用。提交核销码后直接核销，同组其他券同时失效。</p>
            <form className="mc-form" onSubmit={(event) => void submit(event)}>
              <Input
                aria-label="核销码"
                className="mc-code-input"
                controlSize="lg"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="输入核销码（格式：券码-验证码）"
                autoCapitalize="characters"
                autoComplete="off"
                disabled={pending}
              />
              <Button block type="submit" disabled={pending || !input.trim()}>
                {pending ? "核销中……" : "核销"}
              </Button>
            </form>
            {error && <FormMessage>{error}</FormMessage>}
          </div>
        )}
      </main>
    </div>
  );
}

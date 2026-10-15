"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiRequestError, redeemCoupon, type RedeemResponse } from "@/lib/api";
import { RedeemResult } from "../../merchant/_components/redeem-result";
import "../../merchant/merchant.css";

type State =
  | { phase: "loading" }
  | { phase: "missing" }
  | { phase: "error"; message: string }
  | { phase: "done"; response: RedeemResponse };
export default function ScanRedeemPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "loading" });
  const [retry, setRetry] = useState(0);
  const request = useRef<{ key: string; promise: Promise<RedeemResponse> } | null>(null);
  useEffect(() => {
    const totp = new URLSearchParams(window.location.hash.slice(1)).get("t");
    if (!totp) {
      setState({ phase: "missing" });
      return;
    }
    let active = true;
    setState({ phase: "loading" });
    const key = `${params.code}:${totp}:${retry}`;
    // Reuse the mutation during Strict Mode's effect replay, without sharing it
    // between mounted pages or keeping authentication tokens in storage.
    if (request.current?.key !== key)
      request.current = { key, promise: redeemCoupon({ code: params.code, totp }) };
    request.current.promise
      .then((response) => {
        if (active) setState({ phase: "done", response });
      })
      .catch((e: unknown) => {
        if (!active) return;
        if (e instanceof ApiRequestError && e.status === 401) {
          router.replace(`/merchant/login?next=${encodeURIComponent(`/r/${params.code}`)}`);
          return;
        }
        setState({
          phase: "error",
          message: e instanceof Error ? e.message : "请求失败，请重试。",
        });
      });
    return () => {
      active = false;
    };
  }, [params.code, router, retry]);
  return (
    <main className="mc-shell">
      {state.phase === "loading" ? (
        <p className="mc-loading" role="status">
          核销中……
        </p>
      ) : state.phase === "done" ? (
        <RedeemResult response={state.response} />
      ) : (
        <div className="mc-redeem-body">
          <div className="mc-result is-warning">
            <p className="mc-result-label">
              {state.phase === "missing" ? "请重新出示二维码" : "核销请求失败"}
            </p>
            <p>
              {state.phase === "missing" ? "请让用户重新出示二维码并再次扫码。" : state.message}
            </p>
            {state.phase === "error" && (
              <button
                className="ui-button ui-button--primary"
                onClick={() => setRetry((v) => v + 1)}
              >
                重试核销
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

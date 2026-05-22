"use client";

import { useEffect, useState } from "react";
import { INVITE_CODE_LENGTH, PERSONAL_CODE_LENGTH } from "@lilink/shared";
import { recordReferralClick } from "../../../lib/api";

const REFERRAL_COOKIE = "lilink_ref";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Public invite landing page. Routes by code length (8 = recruiter, 10 =
 * personal; other lengths are invalid), records a click (UV-deduped +
 * bot-filtered server-side), stashes the attribution in a cookie for the
 * register form to read back, then redirects to /register.
 */
export function ReferralLandingClient({ code }: { code: string }) {
  const [valid, setValid] = useState<boolean | null>(null);

  useEffect(() => {
    const normalized = code.trim().toUpperCase();
    const len = normalized.length;
    if (len !== PERSONAL_CODE_LENGTH && len !== INVITE_CODE_LENGTH) {
      setValid(false);
      return;
    }

    const search = new URLSearchParams(window.location.search);
    const channel = search.get("ch") ?? undefined;
    const campaignSlug = search.get("c") ?? undefined;

    const payload = encodeURIComponent(
      JSON.stringify({ code: normalized, channel, campaignSlug }),
    );
    document.cookie = `${REFERRAL_COOKIE}=${payload}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;

    void recordReferralClick({ code: normalized, channel, campaignSlug }).catch(
      () => undefined,
    );

    setValid(true);
    const timer = setTimeout(() => {
      window.location.href = "/register";
    }, 1200);
    return () => clearTimeout(timer);
  }, [code]);

  return (
    <main className="app-page-shell v2-page-shell">
      <div style={{ textAlign: "center", padding: "4rem 1.5rem" }}>
        {valid === false ? (
          <>
            <h1>邀请链接无效</h1>
            <p>这个邀请码无法识别，你仍然可以直接注册加入 LiLink。</p>
            <a href="/register">前往注册</a>
          </>
        ) : (
          <>
            <h1>欢迎加入 LiLink</h1>
            <p>正在为你跳转到注册页……</p>
            <a href="/register">没有自动跳转？点此注册</a>
          </>
        )}
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  INVITE_CODE_LENGTH,
  PERSONAL_CODE_LENGTH,
  REFERRAL_CHANNELS,
} from "@lilink/shared";
import { recordReferralClick } from "../../../lib/api";
import "./landing.css";

const REFERRAL_COOKIE = "lilink_ref";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const CAMPAIGN_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function readChannel(raw: string | null): string | undefined {
  if (raw && (REFERRAL_CHANNELS as readonly string[]).includes(raw)) {
    return raw;
  }
  return undefined;
}

function readCampaignSlug(raw: string | null): string | undefined {
  if (raw && CAMPAIGN_SLUG_RE.test(raw)) return raw;
  return undefined;
}

/**
 * Public invite landing page. Routes by code length (8 = recruiter, 10 =
 * personal; other lengths are invalid). The click is recorded first; only when
 * the server confirms a valid code (result OK) is the attribution stashed in a
 * cookie for the register form. ch/c are validated here (and again on register)
 * so invalid values never reach the register DTO and block sign-up.
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
    const channel = readChannel(search.get("ch"));
    const campaignSlug = readCampaignSlug(search.get("c"));

    let cancelled = false;
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;

    recordReferralClick({ code: normalized, channel, campaignSlug })
      .then((result) => {
        if (cancelled) return;
        const ok = result.result === "OK";
        if (ok) {
          const payload = encodeURIComponent(
            JSON.stringify({ code: normalized, channel, campaignSlug }),
          );
          document.cookie = `${REFERRAL_COOKIE}=${payload}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
          redirectTimer = setTimeout(() => {
            window.location.href = "/register";
          }, 1200);
        }
        setValid(ok);
      })
      .catch(() => {
        // Network error: don't block sign-up, but don't claim attribution.
        if (!cancelled) setValid(false);
      });

    return () => {
      cancelled = true;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [code]);

  return (
    <main className="li-center">
      <div className="li-card">
        {valid === false ? (
          <>
            <h1 className="li-title">邀请链接无法识别</h1>
            <p className="li-text">
              该邀请码无效或已过期，你仍然可以直接注册加入 LiLink。
            </p>
            <a className="li-cta" href="/register">
              前往注册
            </a>
          </>
        ) : valid === true ? (
          <>
            <h1 className="li-title">欢迎加入 LiLink</h1>
            <p className="li-text">正在为你跳转到注册页……</p>
            <a className="li-cta" href="/register">
              没有自动跳转？点此注册
            </a>
          </>
        ) : (
          <>
            <h1 className="li-title">正在验证邀请链接……</h1>
            <p className="li-muted">请稍候</p>
          </>
        )}
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { PERSONAL_CODE_LENGTH, REFERRAL_CHANNELS } from "@lilink/shared";
import { recordReferralClick } from "../../../lib/api";
import { ReferralLandingView } from "./landing-view";

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
 * Public invite landing page. Only the personal referral code length is valid;
 * other lengths are invalid. The click is recorded first; only when the server
 * confirms a valid code (result OK) is the attribution stashed in a cookie for
 * the register form. ch/c are validated here (and again on register) so invalid
 * values never reach the register DTO and block sign-up.
 */
export function ReferralLandingClient({ code }: { code: string }) {
  const [valid, setValid] = useState<boolean | null>(null);

  useEffect(() => {
    const normalized = code.trim().toUpperCase();
    if (normalized.length !== PERSONAL_CODE_LENGTH) {
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
            JSON.stringify({ code: normalized, channel, campaignSlug })
          );
          document.cookie = `${REFERRAL_COOKIE}=${payload}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
          redirectTimer = setTimeout(() => {
            window.location.href = "/register/personal";
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

  return <ReferralLandingView valid={valid} />;
}

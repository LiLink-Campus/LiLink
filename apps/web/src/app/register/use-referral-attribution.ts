"use client";

import { PERSONAL_CODE_LENGTH, REFERRAL_CHANNELS } from "@lilink/shared";
import { useEffect, useState } from "react";

const REFERRAL_COOKIE = "lilink_ref";

export function useReferralAttribution() {
  const [referralCode, setReferralCode] = useState("");
  const [referralChannel, setReferralChannel] = useState("");
  const [campaignSlug, setCampaignSlug] = useState("");
  const [attributionLocked, setAttributionLocked] = useState(false);
  const [hasReferralCookie, setHasReferralCookie] = useState(false);

  useEffect(() => {
    const refCookie = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith(`${REFERRAL_COOKIE}=`));
    if (!refCookie) return;

    setHasReferralCookie(true);

    try {
      const parsed = JSON.parse(
        decodeURIComponent(refCookie.slice(`${REFERRAL_COOKIE}=`.length)),
      ) as { code?: unknown; channel?: unknown; campaignSlug?: unknown };
      const refCode = typeof parsed.code === "string" ? parsed.code : "";
      if (refCode.length === PERSONAL_CODE_LENGTH) {
        setReferralCode(refCode);
        setAttributionLocked(true);
      }
      if (
        typeof parsed.channel === "string" &&
        (REFERRAL_CHANNELS as readonly string[]).includes(parsed.channel)
      ) {
        setReferralChannel(parsed.channel);
      }
      if (
        typeof parsed.campaignSlug === "string" &&
        /^[a-z0-9][a-z0-9-]{0,63}$/.test(parsed.campaignSlug)
      ) {
        setCampaignSlug(parsed.campaignSlug);
      }
    } catch {
      // Ignore a malformed referral cookie.
    }
  }, []);

  function clearReferralAttribution() {
    document.cookie = `${REFERRAL_COOKIE}=; path=/; max-age=0; samesite=lax`;
    setReferralCode("");
    setReferralChannel("");
    setCampaignSlug("");
    setAttributionLocked(false);
    setHasReferralCookie(false);
  }

  return {
    referralCode,
    setReferralCode,
    referralChannel,
    campaignSlug,
    attributionLocked,
    hasReferralCookie,
    clearReferralAttribution,
  };
}

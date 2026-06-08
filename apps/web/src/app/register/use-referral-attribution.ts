"use client";

import { PERSONAL_CODE_LENGTH, REFERRAL_CHANNELS } from "@lilink/shared";
import { useEffect, useState } from "react";

export function useReferralAttribution() {
  const [referralCode, setReferralCode] = useState("");
  const [referralChannel, setReferralChannel] = useState("");
  const [campaignSlug, setCampaignSlug] = useState("");
  const [attributionLocked, setAttributionLocked] = useState(false);
  const [hasReferralCookie, setHasReferralCookie] = useState(false);

  useEffect(() => {
    const refCookie = document.cookie
      .split("; ")
      .find((entry) => entry.startsWith("lilink_ref="));
    if (!refCookie) return;

    setHasReferralCookie(true);

    try {
      const parsed = JSON.parse(
        decodeURIComponent(refCookie.slice("lilink_ref=".length)),
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

  return {
    referralCode,
    setReferralCode,
    referralChannel,
    campaignSlug,
    attributionLocked,
    hasReferralCookie,
  };
}

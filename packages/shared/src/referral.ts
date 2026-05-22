/**
 * Referral tracking shared constants.
 *
 * A new user's source is split into two orthogonal concepts:
 *  - source *identity*: who brought them in — a personal referrer
 *    (`User.referredByUserId`) or a recruiter invite code (`User.inviteCodeId`).
 *  - source *campaign*: the attribution frozen at registration
 *    (`User.referralCampaignId`), the single source of truth for funnels.
 */

export const REFERRAL_CHANNELS = [
  "WECHAT_MOMENTS",
  "WECHAT_GROUP",
  "WECHAT_PRIVATE",
  "COPY_LINK",
  "QR",
  "OTHER",
] as const;
export type ReferralChannel = (typeof REFERRAL_CHANNELS)[number];

export const REFERRAL_SOURCE_TYPES = ["PERSONAL", "RECRUITER"] as const;
export type ReferralSourceType = (typeof REFERRAL_SOURCE_TYPES)[number];

export const REFERRAL_EVENT_TYPES = ["CLICK", "SHARE"] as const;
export type ReferralEventType = (typeof REFERRAL_EVENT_TYPES)[number];

const REFERRAL_CHANNEL_SET = new Set<string>(REFERRAL_CHANNELS);

export function isReferralChannel(value: unknown): value is ReferralChannel {
  return typeof value === "string" && REFERRAL_CHANNEL_SET.has(value);
}

export function readReferralChannel(value: unknown): ReferralChannel | null {
  return isReferralChannel(value) ? value : null;
}

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

// Layer 1: source identity — who brought the user in (recruiter > personal > default).
export const REFERRAL_SOURCE_TYPES = [
  "PERSONAL",
  "RECRUITER",
  "DEFAULT",
] as const;
export type ReferralSourceType = (typeof REFERRAL_SOURCE_TYPES)[number];

// Layer 2a: medium — which platform/mechanism was used.
export const REFERRAL_MEDIUMS = ["WECHAT", "LINK", "QR", "OTHER"] as const;
export type ReferralMedium = (typeof REFERRAL_MEDIUMS)[number];

// Layer 2b: scene — sub-channel within a medium (currently only WECHAT has scenes).
export const REFERRAL_SCENES = ["MOMENTS", "GROUP", "PRIVATE"] as const;
export type ReferralScene = (typeof REFERRAL_SCENES)[number];

export const REFERRAL_EVENT_TYPES = ["CLICK", "SHARE"] as const;
export type ReferralEventType = (typeof REFERRAL_EVENT_TYPES)[number];

const REFERRAL_CHANNEL_SET = new Set<string>(REFERRAL_CHANNELS);

export function isReferralChannel(value: unknown): value is ReferralChannel {
  return typeof value === "string" && REFERRAL_CHANNEL_SET.has(value);
}

export function readReferralChannel(value: unknown): ReferralChannel | null {
  return isReferralChannel(value) ? value : null;
}

/**
 * Derives the attribution source from registration fields.
 * Priority: recruiter (inviteCodeId) > personal (referredByUserId) > default.
 */
export function deriveReferralSource({
  inviteCodeId,
  referredByUserId,
}: {
  inviteCodeId?: string | null;
  referredByUserId?: string | null;
}): ReferralSourceType {
  if (inviteCodeId != null) return "RECRUITER";
  if (referredByUserId != null) return "PERSONAL";
  return "DEFAULT";
}

/**
 * Splits a raw channel value into orthogonal medium and scene dimensions.
 * Scene is null for non-WeChat channels.
 */
export function splitReferralChannel(channel: ReferralChannel): {
  medium: ReferralMedium;
  scene: ReferralScene | null;
} {
  switch (channel) {
    case "WECHAT_MOMENTS":
      return { medium: "WECHAT", scene: "MOMENTS" };
    case "WECHAT_GROUP":
      return { medium: "WECHAT", scene: "GROUP" };
    case "WECHAT_PRIVATE":
      return { medium: "WECHAT", scene: "PRIVATE" };
    case "COPY_LINK":
      return { medium: "LINK", scene: null };
    case "QR":
      return { medium: "QR", scene: null };
    case "OTHER":
      return { medium: "OTHER", scene: null };
  }
}

/** Display metadata for each share channel (migrated from ReferralShareSheet.tsx). */
export const CHANNEL_META: Record<
  ReferralChannel,
  { label: string; hint: string; guide: string; opensWeChat?: boolean }
> = {
  WECHAT_PRIVATE: {
    label: "微信私聊",
    hint: "发给一位同学",
    guide: "链接已复制，请打开微信粘贴发送",
    opensWeChat: true,
  },
  WECHAT_GROUP: {
    label: "微信群",
    hint: "发到群聊",
    guide: "链接已复制，请打开微信群粘贴发送",
    opensWeChat: true,
  },
  WECHAT_MOMENTS: {
    label: "微信朋友圈",
    hint: "适合发动态",
    guide: "链接已复制，请打开朋友圈粘贴分享",
    opensWeChat: true,
  },
  COPY_LINK: {
    label: "复制链接",
    hint: "任意平台都能用",
    guide: "邀请链接已复制",
  },
  QR: {
    label: "面对面扫码",
    hint: "线下直接邀请",
    guide: "请同学用微信扫一扫",
  },
  OTHER: {
    label: "其他 App",
    hint: "小红书、QQ 等",
    guide: "链接已复制，可在任意 App 粘贴分享",
  },
};

/** Chinese display labels for each referral medium. */
export const MEDIUM_LABELS: Record<ReferralMedium, string> = {
  WECHAT: "微信",
  LINK: "链接",
  QR: "二维码",
  OTHER: "其他",
};

/** Chinese display labels for each referral scene. */
export const SCENE_LABELS: Record<ReferralScene, string> = {
  MOMENTS: "朋友圈",
  GROUP: "群",
  PRIVATE: "私聊",
};

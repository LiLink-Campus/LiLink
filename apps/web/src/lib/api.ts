import { getClientApiBaseUrl } from "./api-base-url";
import type {
  HardMatchSchoolGenderExclusion,
  MatchEstimateResult,
  MerchantPromotionBlock,
  RedemptionResult,
  SupportedLocale,
} from "@lilink/shared";

const API_ERROR_EN_TO_ZH: Record<string, string> = {
  "This email domain is not currently accepted.":
    "该邮箱后缀不在平台当前支持的学校列表中。请使用学校在后台登记的学校邮箱域名（常见为 .edu.cn 等官方后缀）。若不确定，可向学校 IT 或平台管理员确认。",
  "No valid verification code was found.":
    "未找到有效验证码，请先返回上一步重新获取验证码。",
  "Verification code is invalid. Please request a new one.":
    "验证码不正确或已失效，请重新获取验证码。",
  "This email is already registered.": "该邮箱已注册，请直接登录。",
  "Referral code is required for non-school email registration.":
    "检测到非教育邮箱，请填写有效推荐码。",
  "Referral code is invalid.": "推荐码无效，请检查后重新输入。",
  "Referral quota for non-school email registration has been exhausted.":
    "该推荐码的普通邮箱邀请名额已用完，请联系推荐人或更换推荐码。",
  "School selection is required for non-school email registration.":
    "检测到非教育邮箱，请选择你的学校。",
  "Selected school is invalid.": "所选学校无效，请重新选择。",
  "Email or password is incorrect.": "邮箱或密码不正确。",
  "Account has been suspended.": "账号已被暂停使用。",
  "Account is not active yet.": "账号尚未激活。",
  "Verification email could not be delivered. Please try again later.":
    "验证邮件发送失败，请稍后再试。",
  "User account no longer exists.": "账号不存在。",
  "Submit a complete questionnaire before opting into matching.":
    "请先完成「资料」中的问卷，再参加本轮匹配。",
  "Your questionnaire is missing required fields. Please update your profile before opting into matching.":
    "你的问卷有必填项缺失，请回到「资料」补全后再参加本轮匹配。",
  "Add a one-line intro on your referral card before opting into matching.":
    "请先在「我的」完善一句话介绍，再参加本轮匹配。",
  "Your questionnaire has unsaved incomplete changes. Please finish or discard the draft before opting in.":
    "问卷有未保存的修改且必填项缺失，请回到「资料」补完或撤销修改后再参加本轮匹配。",
  "Selected contact channel must have a value.": "请选择已填写的联系方式。",
  "Phone number must use international format.":
    "手机号请使用国际格式，例如 中国 +86 138 0013 8000。",
  "Contact method value is too long.": "联系方式内容过长。",
  "Duplicate contact method type.": "联系方式类型重复。",
  MEETUP_LOCATION_OPTION_AMBIGUOUS:
    "每个地点选项只能二选一：推荐地点或自定义地点，不能同时填写。",
  "Merchant email or password is invalid.": "商家邮箱或密码不正确。",
  "Merchant authentication is required.": "请先登录商家账号。",
  "Merchant session is invalid.": "商家登录状态已失效，请重新登录。",
  "A merchant user with this email already exists.":
    "该邮箱已被其他商家账号使用。",
};

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}

function userFacingApiMessage(raw: string): string {
  const trimmed = raw.trim();
  return API_ERROR_EN_TO_ZH[trimmed] ?? trimmed;
}

function parseFailedResponseBody(text: string, status: number): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return `请求失败（${status}）`;
  }
  try {
    const parsed = JSON.parse(trimmed) as { message?: unknown };
    if (typeof parsed.message === "string") {
      return userFacingApiMessage(parsed.message);
    }
    if (Array.isArray(parsed.message)) {
      const parts = parsed.message.filter(
        (item): item is string => typeof item === "string",
      );
      if (parts.length > 0) {
        return parts.map(userFacingApiMessage).join("；");
      }
    }
  } catch {
    // Response is not JSON; show body as-is (e.g. proxy HTML).
  }
  return trimmed;
}

export async function fetchApi<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);

  if (init?.body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${getClientApiBaseUrl()}${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: init?.cache ?? "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ApiRequestError(
      parseFailedResponseBody(body, response.status),
      response.status,
    );
  }

  const text = await response.text();
  if (!text) return null as unknown as T;
  return JSON.parse(text) as T;
}

export type MeetupExpirationWeeks = 1 | 2 | 3 | 4;

export type AuthMePayload = {
  id: string;
  email: string;
  displayName: string | null;
  preferredLocale: SupportedLocale;
  meetupExpirationWeeks: MeetupExpirationWeeks;
};

type MeetupSessionStatus =
  | "ACTIVE"
  | "LOCKED"
  | "CANCELED"
  | "EXPIRED"
  | "ARCHIVED";

export type MeetupUserTurnStatus =
  | "NOT_STARTED"
  | "WAITING_FOR_COUNTERPART"
  | "NEEDS_YOUR_RESPONSE"
  | "NONE";

export type MeetupProgressStatus =
  | "NOT_STARTED"
  | "NEGOTIATING"
  | "LOCATION_CONFIRMED_TIME_PENDING"
  | "TIME_CONFIRMED_LOCATION_PENDING"
  | "AWAITING_FINAL_CONFIRMATION"
  | "LOCKED"
  | "CANCELED"
  | "EXPIRED"
  | "ARCHIVED";

export type MeetupProposalScope = "BOTH" | "TIME_ONLY" | "LOCATION_ONLY";

type MeetupParticipantTurnState = "NONE" | "REQUIRED" | "WAITING";

type MeetupMessageType =
  | "PROPOSE"
  | "ACCEPT"
  | "REJECT"
  | "FINAL_CONFIRM"
  | "REVISE_AFTER_LOCK"
  | "CANCEL";

type MeetupProposalStatus =
  | "PENDING"
  | "PARTIALLY_ACCEPTED"
  | "CONFIRMED"
  | "REJECTED"
  | "SUPERSEDED";

type MeetupOptionKind = "TIME" | "LOCATION";

type MeetupOptionStatus = "PENDING" | "CONFIRMED" | "REJECTED" | "DISABLED";

export type MeetupLocationCandidate = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

type MeetupActionAvailability = {
  enabled: boolean;
  reason: string | null;
};

type MeetupAvailableActions = {
  propose: MeetupActionAvailability;
  accept: MeetupActionAvailability & {
    requiredOptionKinds: MeetupOptionKind[];
  };
  reject: MeetupActionAvailability;
  finalConfirm: MeetupActionAvailability;
  reviseAfterLock: MeetupActionAvailability;
  cancel: MeetupActionAvailability;
};

export type MeetupOption = {
  id: string;
  kind: MeetupOptionKind;
  status: MeetupOptionStatus;
  startsAt: string | null;
  endsAt: string | null;
  toleranceMinutes: number | null;
  locationCandidateId: string | null;
  placeName: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type MeetupProposal = {
  id: string;
  actorUserId: string;
  scope: MeetupProposalScope;
  status: MeetupProposalStatus;
  options: MeetupOption[];
};

export type MeetupMessage = {
  id: string;
  actorUserId: string;
  type: MeetupMessageType;
  notePreset: string | null;
  noteText: string | null;
  createdAt: string;
  proposal: MeetupProposal | null;
};

type MeetupParticipant = {
  userId: string;
  displayName: string | null;
  turnState: MeetupParticipantTurnState;
  revisionUsedAt: string | null;
  lastSeenAt: string | null;
};

type MeetupCurrentPlan = {
  timeOption: MeetupOption | null;
  locationOption: MeetupOption | null;
  startsAt: string | null;
  endsAt: string | null;
  toleranceMinutes: number | null;
  locationCandidateId: string | null;
  placeName: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type MeetupSessionResponse = {
  id: string;
  matchId: string;
  status: MeetupSessionStatus;
  userTurnStatus: MeetupUserTurnStatus;
  progressStatus: MeetupProgressStatus;
  startedByUserId: string;
  counterpartUserId: string;
  counterpartDisplayName: string | null;
  currentProposalId: string | null;
  confirmedTimeOptionId: string | null;
  confirmedLocationOptionId: string | null;
  finalConfirmRequiredByUserId: string | null;
  lockedAt: string | null;
  canceledAt: string | null;
  canceledByUserId: string | null;
  effectiveExpirationWeeks: number | null;
  expiresAt: string | null;
  archiveEligibleAt: string | null;
  lastActiveAt: string;
  currentPlan: MeetupCurrentPlan;
  currentPendingProposal: MeetupProposal | null;
  participants: MeetupParticipant[];
  messages: MeetupMessage[];
  availableActions: MeetupAvailableActions;
};

type MeetupTimeOptionInput = {
  startsAt: string;
  endsAt: string;
  toleranceMinutes?: number;
};

type MeetupLocationOptionInput =
  | {
      locationCandidateId: string;
      placeName?: never;
    }
  | {
      locationCandidateId?: never;
      placeName: string;
    };

export type MeetupProposalPayload = {
  scope: MeetupProposalScope;
  timeOptions?: MeetupTimeOptionInput[];
  locationOptions?: MeetupLocationOptionInput[];
  notePreset?: string;
  noteText?: string;
};

export type AcceptMeetupOptionsPayload = {
  timeOptionId?: string;
  locationOptionId?: string;
  notePreset?: string;
  noteText?: string;
};

export type MeetupNotePayload = {
  notePreset?: string;
  noteText?: string;
};

export type CancelMeetupSessionPayload = {
  note?: string;
};

export function fetchMeetupLocationCandidates() {
  return fetchApi<MeetupLocationCandidate[]>("/me/meetup-location-candidates");
}

export function startMeetupSession(
  matchId: string,
  proposal: MeetupProposalPayload,
) {
  return fetchApi<MeetupSessionResponse>(
    `/me/matches/${matchId}/meetup/start`,
    {
      method: "POST",
      body: JSON.stringify({ proposal }),
    },
  );
}

export function createMeetupProposal(
  sessionId: string,
  proposal: MeetupProposalPayload,
) {
  return fetchApi<MeetupSessionResponse>(
    `/me/meetup-sessions/${sessionId}/proposals`,
    {
      method: "POST",
      body: JSON.stringify(proposal),
    },
  );
}

export function acceptMeetupOptions(
  sessionId: string,
  payload: AcceptMeetupOptionsPayload,
) {
  return fetchApi<MeetupSessionResponse>(
    `/me/meetup-sessions/${sessionId}/options/accept`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function rejectMeetupProposal(
  sessionId: string,
  proposalId: string,
  payload: MeetupNotePayload = {},
) {
  return fetchApi<MeetupSessionResponse>(
    `/me/meetup-sessions/${sessionId}/proposals/${proposalId}/reject`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function finalConfirmMeetupSession(sessionId: string) {
  return fetchApi<MeetupSessionResponse>(
    `/me/meetup-sessions/${sessionId}/final-confirm`,
    { method: "POST" },
  );
}

export function reviseMeetupSession(
  sessionId: string,
  proposal: MeetupProposalPayload,
) {
  return fetchApi<MeetupSessionResponse>(
    `/me/meetup-sessions/${sessionId}/revise`,
    {
      method: "POST",
      body: JSON.stringify({ proposal }),
    },
  );
}

export function cancelMeetupSession(
  sessionId: string,
  payload: CancelMeetupSessionPayload = {},
) {
  return fetchApi<MeetupSessionResponse>(
    `/me/meetup-sessions/${sessionId}/cancel`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function markMeetupSessionSeen(sessionId: string) {
  await fetchApi<null>(`/me/meetup-sessions/${sessionId}/seen`, {
    method: "POST",
  });
}

let authMeInflight: Promise<AuthMePayload | null> | null = null;

/**
 * Coalesces overlapping GET /auth/me calls (e.g. SiteNav + Dashboard on first paint).
 * Clears after settle so a later navigation still refetches fresh session state.
 */
export function fetchAuthMeDeduped(): Promise<AuthMePayload | null> {
  if (!authMeInflight) {
    authMeInflight = fetchApi<AuthMePayload>("/auth/me")
      .catch(() => null)
      .finally(() => {
        authMeInflight = null;
      });
  }
  return authMeInflight;
}

export type MatchEstimatePayload = {
  excludedPartnerSchools: string[];
  excludedPartnerSchoolGenders: HardMatchSchoolGenderExclusion[];
};

export type MatchEstimate = Extract<MatchEstimateResult, { available: true }>;

/**
 * Estimate the coarse match-odds band for a set of partner-school /
 * partner-gender exclusions, against the current cycle's opted-in pool. Returns
 * only availability, the band, and a low-confidence flag — never raw pool counts.
 */
export function fetchMatchEstimate(payload: MatchEstimatePayload) {
  return fetchApi<MatchEstimateResult>("/me/match-estimate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// --- Merchant promotion system (user-facing) ---

type ReferralFunnel = {
  invited: number;
  registered: number;
  activated: number;
  granted: number;
  redeemed: number;
};

type NonEduReferralQuota = {
  limit: number;
  uses: number;
  remaining: number;
};

export type MyReferralOverview = {
  referralCode: string | null;
  links: { channel: string; url: string }[];
  funnel: ReferralFunnel;
  nonEduReferralQuota: NonEduReferralQuota;
};

export function fetchMyReferral() {
  return fetchApi<MyReferralOverview>("/me/referral");
}

export function recordShareEvent(channel: string, campaignSlug?: string) {
  return fetchApi<{ ok: boolean }>("/referral/events", {
    method: "POST",
    body: JSON.stringify({
      channel,
      ...(campaignSlug ? { campaignSlug } : {}),
    }),
  });
}

export type ReferralClickResult = { result: "OK" | "INVALID" };

export function recordReferralClick(payload: {
  code: string;
  channel?: string;
  campaignSlug?: string;
}) {
  return fetchApi<ReferralClickResult>("/referral/click", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

type MyCouponStatus = "ISSUED" | "REDEEMED" | "EXPIRED" | "VOID";

export type MyCoupon = {
  id: string;
  status: MyCouponStatus;
  code: string;
  merchantName: string;
  title: string;
  benefitType: string;
  benefitText: string;
  faceValue: number;
  issuedAt: string;
  expiresAt: string | null;
  redeemedAt: string | null;
};

export function fetchMyCoupons() {
  return fetchApi<{ items: MyCoupon[] }>("/me/coupons");
}

export type CouponAgendaReadState = {
  target: string;
  version: string;
  availableCount: number;
  unreadAvailableCount: number;
  read: boolean;
  readAt: string | null;
  href: "/dashboard/coupons";
};

export function fetchCouponAgendaReadState() {
  return fetchApi<CouponAgendaReadState>("/me/coupons/read-state");
}

export function markCouponAgendaRead() {
  return fetchApi<CouponAgendaReadState>("/me/coupons/read-state", {
    method: "POST",
  });
}

export type CouponRedeemSecret = {
  code: string;
  secret: string;
  period: number;
  digits: number;
};

export function getCouponRedeemSecret(couponId: string) {
  return fetchApi<CouponRedeemSecret>(`/me/coupons/${couponId}/redeem-secret`);
}

export type CouponStatusResponse = {
  status: MyCouponStatus;
  redeemedAt?: string;
  applied?: {
    orderAmount: number | null;
    discountAmount: number;
    gift: string | null;
  };
  merchantPromotion?: MerchantPromotionBlock[];
};

export function getCouponStatus(couponId: string) {
  return fetchApi<CouponStatusResponse>(`/me/coupons/${couponId}/status`);
}

// --- Merchant portal (separate session from user/admin) ---

export type MerchantSessionUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  merchantId: string;
  merchantName: string;
};

export function merchantLogin(email: string, password: string) {
  return fetchApi<{ ok: boolean; merchantUser: MerchantSessionUser }>(
    "/merchant/auth/login",
    { method: "POST", body: JSON.stringify({ email, password }) },
  );
}

export function merchantLogout() {
  return fetchApi<{ ok: boolean }>("/merchant/auth/logout", { method: "POST" });
}

export function fetchMerchantMe() {
  return fetchApi<{ ok: boolean; merchantUser: MerchantSessionUser }>(
    "/merchant/auth/me",
  );
}

/** Coupon snapshot returned by both prepare and redeem endpoints. */
export type RedeemCouponInfo = {
  title: string;
  benefitText: string;
  faceValue: number;
  userDisplayName: string | null;
};

/** Prepare succeeded: coupon info available, ticket issued. */
export type PrepareRedeemOk = {
  result: "OK";
  coupon: RedeemCouponInfo;
  needAmount: boolean;
  redeemTicket: string;
};

/** Prepare failed with a specific reason. */
export type PrepareRedeemFail = {
  result: "INVALID" | "ALREADY_USED" | "EXPIRED_CODE";
};

/** Response from POST /merchant/redeem/prepare */
export type PrepareRedeemResponse = PrepareRedeemOk | PrepareRedeemFail;

/** Response from POST /merchant/redeem (ticket-based, no merchantPromotion). */
export type RedeemResponse = {
  result: RedemptionResult;
  coupon: RedeemCouponInfo | null;
  // The benefit resolved at redemption (SUCCESS only).
  applied: {
    orderAmount: number | null;
    discountAmount: number;
    gift: string | null;
  } | null;
};

export function prepareRedeem(payload: { code: string; totp: string }) {
  return fetchApi<PrepareRedeemResponse>("/merchant/redeem/prepare", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function redeemCoupon(payload: {
  redeemTicket: string;
  orderAmount?: number;
}) {
  return fetchApi<RedeemResponse>("/merchant/redeem", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

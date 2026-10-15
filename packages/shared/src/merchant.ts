export const MERCHANT_USER_ROLES = ["OWNER", "STAFF"] as const;
export type MerchantUserRole = (typeof MERCHANT_USER_ROLES)[number];

export const REDEMPTION_RESULTS = [
  "SUCCESS",
  "ALREADY_USED",
  "GROUP_USED",
  "EXPIRED_CODE",
  "INVALID",
] as const;
export type RedemptionResult = (typeof REDEMPTION_RESULTS)[number];

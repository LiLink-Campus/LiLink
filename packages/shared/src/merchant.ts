/**
 * Merchant accounts, redemption results, and the merchant promotion slot shown
 * on the redemption-success page.
 */

export const MERCHANT_USER_ROLES = ["OWNER", "STAFF"] as const;
export type MerchantUserRole = (typeof MERCHANT_USER_ROLES)[number];

export const REDEMPTION_RESULTS = ["SUCCESS", "ALREADY_USED", "INVALID"] as const;
export type RedemptionResult = (typeof REDEMPTION_RESULTS)[number];

export const MERCHANT_PROMOTION_BLOCK_TYPES = ["TEXT", "IMAGE", "QRCODE"] as const;
export type MerchantPromotionBlockType =
  (typeof MERCHANT_PROMOTION_BLOCK_TYPES)[number];

/**
 * A merchant-configured promotion block rendered on the redemption-success page
 * (e.g. WeChat official-account QR code, phone, copy). Stored on
 * `Merchant.promotionBlocks` (Json). Image URLs must be https; text/caption are
 * escaped on render. At most MERCHANT_PROMOTION_MAX_BLOCKS blocks.
 */
export type MerchantPromotionBlock =
  | { type: "TEXT"; text: string }
  | { type: "IMAGE"; imageUrl: string; caption?: string }
  | { type: "QRCODE"; imageUrl: string; caption?: string };

export type MerchantPromotion = MerchantPromotionBlock[];

export const MERCHANT_PROMOTION_MAX_BLOCKS = 5;
export const MERCHANT_PROMOTION_TEXT_MAX = 200;

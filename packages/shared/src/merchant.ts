/**
 * Merchant accounts, redemption results, and the merchant promotion slot shown
 * on the redemption-success page.
 */

export const MERCHANT_USER_ROLES = ["OWNER", "STAFF"] as const;
export type MerchantUserRole = (typeof MERCHANT_USER_ROLES)[number];

/**
 * Redemption outcomes. The first three are the original SQL-level states; the
 * last two (contract §B) arise only after the code matches a valid coupon of
 * the requesting merchant, so they do not leak existence:
 * - NEED_AMOUNT: the coupon's rule is amount-dependent but no orderAmount was
 *   given — re-prompt with the amount; the coupon is NOT consumed.
 * - BELOW_THRESHOLD: the orderAmount meets no tier — the coupon is NOT consumed.
 */
export const REDEMPTION_RESULTS = [
  "SUCCESS",
  "ALREADY_USED",
  "INVALID",
  "BELOW_THRESHOLD",
  "NEED_AMOUNT",
] as const;
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

/**
 * Validate and normalize a merchant promotion-blocks payload on ingress (admin
 * edit / API). Enforces block count, allowed types, https-only image URLs, and
 * text limits, returning normalized blocks. Rendering still escapes text.
 */
export function validateMerchantPromotionBlocks(
  input: unknown,
): MerchantPromotionBlock[] {
  if (input == null) return [];
  if (!Array.isArray(input)) {
    throw new Error("Promotion blocks must be an array.");
  }
  if (input.length > MERCHANT_PROMOTION_MAX_BLOCKS) {
    throw new Error(
      `At most ${MERCHANT_PROMOTION_MAX_BLOCKS} promotion blocks are allowed.`,
    );
  }
  return input.map((raw, index) => normalizePromotionBlock(raw, index));
}

function normalizePromotionBlock(
  raw: unknown,
  index: number,
): MerchantPromotionBlock {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`Promotion block #${index + 1} must be an object.`);
  }
  const block = raw as Record<string, unknown>;
  if (block.type === "TEXT") {
    return { type: "TEXT", text: readPromotionText(block.text, index) };
  }
  if (block.type === "IMAGE" || block.type === "QRCODE") {
    const imageUrl = readHttpsUrl(block.imageUrl, index);
    const caption = readOptionalCaption(block.caption, index);
    return caption === undefined
      ? { type: block.type, imageUrl }
      : { type: block.type, imageUrl, caption };
  }
  throw new Error(`Promotion block #${index + 1} has an unsupported type.`);
}

function readPromotionText(value: unknown, index: number): string {
  if (typeof value !== "string") {
    throw new Error(`Promotion block #${index + 1} text must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Promotion block #${index + 1} text is required.`);
  }
  if (trimmed.length > MERCHANT_PROMOTION_TEXT_MAX) {
    throw new Error(
      `Promotion block #${index + 1} text exceeds ${MERCHANT_PROMOTION_TEXT_MAX} characters.`,
    );
  }
  return trimmed;
}

function readOptionalCaption(
  value: unknown,
  index: number,
): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") {
    throw new Error(`Promotion block #${index + 1} caption must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MERCHANT_PROMOTION_TEXT_MAX) {
    throw new Error(
      `Promotion block #${index + 1} caption exceeds ${MERCHANT_PROMOTION_TEXT_MAX} characters.`,
    );
  }
  return trimmed;
}

function readHttpsUrl(value: unknown, index: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Promotion block #${index + 1} imageUrl is required.`);
  }
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(
      `Promotion block #${index + 1} imageUrl is not a valid URL.`,
    );
  }
  if (url.protocol !== "https:") {
    throw new Error(`Promotion block #${index + 1} imageUrl must be https.`);
  }
  return url.toString();
}

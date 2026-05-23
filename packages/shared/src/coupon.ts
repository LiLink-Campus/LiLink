/**
 * Coupon benefit types, statuses, and the tiered benefit-rule model (contract
 * §A) plus its redemption-time evaluation (contract §B).
 *
 * Coupons are granted as ISSUED (usable) on activation — there is no manual
 * "claim" step. Effective usability also requires the holder to be ACTIVE,
 * which the server re-checks at redemption time (not encodable here).
 *
 * A coupon's benefit is modeled as a versioned ladder of tiers. Each tier has
 * a `minSpend` threshold (cents) and one benefit: an amount off (满减), a
 * percentage off (折扣), or a gift (满赠). At redemption the highest tier whose
 * `minSpend <= orderAmount` applies. `CUSTOM` coupons carry no structured rule
 * (benefitText falls back to the title).
 *
 * Consumers MUST go through the helpers here (renderBenefitText / evaluateCoupon
 * / requiresOrderAmount) and never read `rule` directly, so the shape can evolve
 * (e.g. adding conditions or new benefit kinds via a version bump) without
 * touching call sites. `faceValue` stays the reconciliation anchor, independent
 * of the rule.
 */

export const COUPON_BENEFIT_TYPES = [
  "FULL_REDUCTION",
  "DISCOUNT",
  "GIFT",
  "CUSTOM",
] as const;
export type CouponBenefitType = (typeof COUPON_BENEFIT_TYPES)[number];

export const COUPON_STATUSES = [
  "ISSUED",
  "REDEEMED",
  "EXPIRED",
  "VOID",
] as const;
export type CouponStatus = (typeof COUPON_STATUSES)[number];

/**
 * Whether a coupon is in a redeemable shape. The server additionally enforces
 * `user.status === 'ACTIVE'` at redemption; that is not represented here.
 */
export function isCouponRedeemable(
  coupon: { status: CouponStatus; expiresAt: string | Date | null },
  now: Date = new Date(),
): boolean {
  if (coupon.status !== "ISSUED") return false;
  if (coupon.expiresAt == null) return true;
  const expiresAt =
    coupon.expiresAt instanceof Date
      ? coupon.expiresAt
      : new Date(coupon.expiresAt);
  return expiresAt.getTime() > now.getTime();
}

/**
 * Effective status for display: an ISSUED coupon past its expiry is reported as
 * EXPIRED so the coupon page can partition stably without a cron job.
 */
export function effectiveCouponStatus(
  coupon: { status: CouponStatus; expiresAt: string | Date | null },
  now: Date = new Date(),
): CouponStatus {
  if (coupon.status === "ISSUED" && !isCouponRedeemable(coupon, now)) {
    return "EXPIRED";
  }
  return coupon.status;
}

// ---- Benefit-rule model (§A) ----

export const COUPON_RULE_VERSION = 1;
/** Upper bound on tiers per coupon, to bound editor + evaluation work. */
export const COUPON_RULE_MAX_TIERS = 12;
/** Max characters for a gift description. */
export const COUPON_GIFT_DESCRIPTION_MAX = 200;

/** A single benefit applied when a tier is met. */
export type CouponBenefit =
  | { type: "AMOUNT_OFF"; amountOff: number } // 满减: fixed cents off
  | { type: "PERCENT_OFF"; percentOff: number; maxOff?: number } // 折扣: 1–99% off, optional cap (cents)
  | { type: "GIFT"; description: string }; // 满赠: free-text gift
export type CouponBenefitKind = CouponBenefit["type"];

/** One rung of the ladder: spend at least `minSpend` (cents) to get `benefit`. */
export interface CouponTier {
  minSpend: number;
  benefit: CouponBenefit;
}

/** A versioned ladder of tiers. The highest met tier applies at redemption. */
export interface CouponRule {
  version: typeof COUPON_RULE_VERSION;
  tiers: CouponTier[];
}

/**
 * Maps the coarse `benefitType` (used for list display) to the tier benefit
 * kind every tier of such a coupon must use. `CUSTOM` has no structured rule.
 */
export const BENEFIT_TYPE_TIER_KIND: Record<
  Exclude<CouponBenefitType, "CUSTOM">,
  CouponBenefitKind
> = {
  FULL_REDUCTION: "AMOUNT_OFF",
  DISCOUNT: "PERCENT_OFF",
  GIFT: "GIFT",
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Best-effort parse of a stored rule into a CouponRule, or null when it is not a
 * structured tiered rule (CUSTOM / empty / legacy / malformed). Never throws —
 * runtime consumers (render / evaluate / requiresOrderAmount) rely on this to
 * interpret data defensively. Use `validateCouponRule` for strict ingress.
 */
export function parseCouponRule(rule: unknown): CouponRule | null {
  if (!isPlainObject(rule)) return null;
  if (rule.version !== COUPON_RULE_VERSION) return null;
  if (!Array.isArray(rule.tiers) || rule.tiers.length === 0) return null;

  const tiers: CouponTier[] = [];
  for (const raw of rule.tiers) {
    if (!isPlainObject(raw) || !isNonNegativeInt(raw.minSpend)) return null;
    const benefit = parseBenefit(raw.benefit);
    if (!benefit) return null;
    tiers.push({ minSpend: raw.minSpend, benefit });
  }
  return { version: COUPON_RULE_VERSION, tiers };
}

function parseBenefit(raw: unknown): CouponBenefit | null {
  if (!isPlainObject(raw)) return null;
  switch (raw.type) {
    case "AMOUNT_OFF":
      return isPositiveInt(raw.amountOff)
        ? { type: "AMOUNT_OFF", amountOff: raw.amountOff }
        : null;
    case "PERCENT_OFF": {
      if (
        typeof raw.percentOff !== "number" ||
        !Number.isInteger(raw.percentOff) ||
        raw.percentOff < 1 ||
        raw.percentOff > 99
      ) {
        return null;
      }
      if (raw.maxOff != null && !isPositiveInt(raw.maxOff)) return null;
      return raw.maxOff == null
        ? { type: "PERCENT_OFF", percentOff: raw.percentOff }
        : { type: "PERCENT_OFF", percentOff: raw.percentOff, maxOff: raw.maxOff };
    }
    case "GIFT":
      return typeof raw.description === "string" && raw.description.trim()
        ? { type: "GIFT", description: raw.description.trim() }
        : null;
    default:
      return null;
  }
}

/**
 * Validate + normalize a rule payload at coupon-template creation, against the
 * template's coarse `benefitType`. Throws a descriptive Error on any problem.
 *
 * - `CUSTOM` must carry no structured rule -> returns null.
 * - `FULL_REDUCTION` / `DISCOUNT` / `GIFT` require a non-empty tier ladder whose
 *   every benefit matches the expected kind (AMOUNT_OFF / PERCENT_OFF / GIFT),
 *   with tiers sorted by strictly increasing minSpend.
 */
export function validateCouponRule(
  rule: unknown,
  benefitType: CouponBenefitType,
): CouponRule | null {
  if (benefitType === "CUSTOM") {
    if (rule == null) return null;
    if (isPlainObject(rule) && Object.keys(rule).length === 0) return null;
    throw new Error("CUSTOM coupons do not take a structured rule.");
  }

  const expectedKind = BENEFIT_TYPE_TIER_KIND[benefitType];
  if (rule == null) {
    throw new Error("A coupon rule with at least one tier is required.");
  }
  if (!isPlainObject(rule)) {
    throw new Error("Coupon rule must be an object.");
  }
  if (rule.version !== COUPON_RULE_VERSION) {
    throw new Error(
      `Unsupported coupon rule version (expected ${COUPON_RULE_VERSION}).`,
    );
  }
  if (!Array.isArray(rule.tiers) || rule.tiers.length === 0) {
    throw new Error("Coupon rule must have at least one tier.");
  }
  if (rule.tiers.length > COUPON_RULE_MAX_TIERS) {
    throw new Error(
      `A coupon rule allows at most ${COUPON_RULE_MAX_TIERS} tiers.`,
    );
  }

  const tiers: CouponTier[] = [];
  let prevMinSpend = -1;
  rule.tiers.forEach((raw, index) => {
    const at = `Tier #${index + 1}`;
    if (!isPlainObject(raw)) throw new Error(`${at} must be an object.`);
    if (!isNonNegativeInt(raw.minSpend)) {
      throw new Error(`${at} minSpend must be a non-negative integer (cents).`);
    }
    if (raw.minSpend <= prevMinSpend) {
      throw new Error("Tiers must be sorted by strictly increasing minSpend.");
    }
    prevMinSpend = raw.minSpend;
    tiers.push({
      minSpend: raw.minSpend,
      benefit: validateBenefit(raw.benefit, expectedKind, raw.minSpend, at),
    });
  });
  return { version: COUPON_RULE_VERSION, tiers };
}

function validateBenefit(
  raw: unknown,
  expectedKind: CouponBenefitKind,
  minSpend: number,
  at: string,
): CouponBenefit {
  if (!isPlainObject(raw)) throw new Error(`${at} is missing a benefit.`);
  if (raw.type !== expectedKind) {
    throw new Error(`${at} benefit type must be ${expectedKind} for this coupon.`);
  }
  switch (expectedKind) {
    case "AMOUNT_OFF": {
      if (!isPositiveInt(raw.amountOff)) {
        throw new Error(`${at} amountOff must be a positive integer (cents).`);
      }
      if (minSpend > 0 && raw.amountOff > minSpend) {
        throw new Error(`${at} amountOff cannot exceed its minSpend.`);
      }
      return { type: "AMOUNT_OFF", amountOff: raw.amountOff };
    }
    case "PERCENT_OFF": {
      if (
        typeof raw.percentOff !== "number" ||
        !Number.isInteger(raw.percentOff) ||
        raw.percentOff < 1 ||
        raw.percentOff > 99
      ) {
        throw new Error(`${at} percentOff must be an integer between 1 and 99.`);
      }
      if (raw.maxOff != null && !isPositiveInt(raw.maxOff)) {
        throw new Error(`${at} maxOff must be a positive integer (cents) when set.`);
      }
      return raw.maxOff == null
        ? { type: "PERCENT_OFF", percentOff: raw.percentOff }
        : { type: "PERCENT_OFF", percentOff: raw.percentOff, maxOff: raw.maxOff };
    }
    case "GIFT": {
      if (typeof raw.description !== "string" || !raw.description.trim()) {
        throw new Error(`${at} gift description is required.`);
      }
      if (raw.description.trim().length > COUPON_GIFT_DESCRIPTION_MAX) {
        throw new Error(
          `${at} gift description exceeds ${COUPON_GIFT_DESCRIPTION_MAX} characters.`,
        );
      }
      return { type: "GIFT", description: raw.description.trim() };
    }
    default:
      throw new Error(`${at} has an unsupported benefit type.`);
  }
}

/**
 * A tier needs an order amount to resolve when it has a positive threshold (the
 * amount picks the tier) OR its benefit is percentage-based (the amount is
 * needed to compute the discount). A no-threshold fixed amount-off / gift does
 * not need the amount.
 */
function tierNeedsOrderAmount(tier: CouponTier): boolean {
  return tier.minSpend > 0 || tier.benefit.type === "PERCENT_OFF";
}

/**
 * Whether redemption requires the merchant to enter an order amount: true when
 * any tier has a positive threshold or a percentage benefit. No-threshold
 * fixed/gift coupons and CUSTOM coupons need no amount.
 */
export function requiresOrderAmount(rule?: CouponRule | null): boolean {
  const parsed = parseCouponRule(rule as unknown);
  return parsed != null && parsed.tiers.some(tierNeedsOrderAmount);
}

/** Successful evaluation: which tier applied, the cash discount, and the gift. */
export type CouponEvaluation =
  | {
      ok: true;
      appliedTier: CouponTier | null; // null for CUSTOM / no-rule coupons
      discount: number; // cents off (0 for gifts / no-rule)
      gift: string | null;
    }
  | { ok: false; reason: "NEED_AMOUNT" | "BELOW_THRESHOLD" };

/**
 * Evaluate a coupon at redemption time. Picks the highest tier whose minSpend is
 * met by `orderAmount` and computes the cash discount / gift. Returns
 * `NEED_AMOUNT` when an amount-dependent rule has no amount, and
 * `BELOW_THRESHOLD` when the amount meets no tier — in both cases the caller
 * must NOT consume the coupon. CUSTOM / no-rule coupons always pass with no
 * discount.
 */
export function evaluateCoupon(
  rule: CouponRule | null | undefined,
  ctx: { orderAmount?: number; now?: Date },
): CouponEvaluation {
  const parsed = parseCouponRule(rule as unknown);
  if (!parsed) return { ok: true, appliedTier: null, discount: 0, gift: null };

  const needsAmount = parsed.tiers.some(tierNeedsOrderAmount);
  const { orderAmount } = ctx;
  if (orderAmount == null) {
    if (needsAmount) return { ok: false, reason: "NEED_AMOUNT" };
    const tier = pickTier(parsed.tiers, 0);
    return tier
      ? applyTier(tier, 0)
      : { ok: false, reason: "BELOW_THRESHOLD" };
  }

  const tier = pickTier(parsed.tiers, orderAmount);
  if (!tier) return { ok: false, reason: "BELOW_THRESHOLD" };
  return applyTier(tier, orderAmount);
}

/** Highest tier whose minSpend is met; order-independent (no sort assumed). */
function pickTier(tiers: CouponTier[], orderAmount: number): CouponTier | null {
  let best: CouponTier | null = null;
  for (const tier of tiers) {
    if (tier.minSpend <= orderAmount && (!best || tier.minSpend > best.minSpend)) {
      best = tier;
    }
  }
  return best;
}

function applyTier(tier: CouponTier, orderAmount: number): CouponEvaluation {
  const benefit = tier.benefit;
  if (benefit.type === "AMOUNT_OFF") {
    return { ok: true, appliedTier: tier, discount: benefit.amountOff, gift: null };
  }
  if (benefit.type === "GIFT") {
    return { ok: true, appliedTier: tier, discount: 0, gift: benefit.description };
  }
  let discount = Math.round((orderAmount * benefit.percentOff) / 100);
  if (benefit.maxOff != null) discount = Math.min(discount, benefit.maxOff);
  return { ok: true, appliedTier: tier, discount, gift: null };
}

export interface CouponBenefitDescriptor {
  benefitType: CouponBenefitType;
  title: string;
  faceValue: number; // nominal value in cents; reconciliation anchor
  rule?: CouponRule | null;
}

/**
 * Human-readable text for a coupon benefit. Renders the tier ladder (e.g.
 * "满30减5 ｜ 满50减12 ｜ 满100减30"); falls back to the title for CUSTOM /
 * no-rule coupons.
 */
export function renderBenefitText(benefit: CouponBenefitDescriptor): string {
  const parsed = parseCouponRule(benefit.rule as unknown);
  if (!parsed) return benefit.title;
  return parsed.tiers.map(renderTier).join(" ｜ ");
}

function renderTier(tier: CouponTier): string {
  const benefit = tier.benefit;
  const hasThreshold = tier.minSpend > 0;
  const min = formatYuan(tier.minSpend);
  if (benefit.type === "AMOUNT_OFF") {
    return hasThreshold
      ? `满${min}减${formatYuan(benefit.amountOff)}`
      : `立减${formatYuan(benefit.amountOff)}元`;
  }
  if (benefit.type === "GIFT") {
    return hasThreshold ? `满${min}送${benefit.description}` : `赠${benefit.description}`;
  }
  const zhe = formatZhe(benefit.percentOff);
  const cap = benefit.maxOff != null ? `(最高减${formatYuan(benefit.maxOff)}元)` : "";
  return hasThreshold ? `满${min}享${zhe}${cap}` : `全场${zhe}${cap}`;
}

/** Cents -> yuan string, trimming trailing zeros (3000 -> "30", 1250 -> "12.5"). */
function formatYuan(cents: number): string {
  const yuan = cents / 100;
  if (Number.isInteger(yuan)) return String(yuan);
  return yuan.toFixed(2).replace(/0$/, "");
}

/** A percent-off (e.g. 20) rendered as a Chinese 折 rate (20% off -> "8折"). */
function formatZhe(percentOff: number): string {
  const zhe = (100 - percentOff) / 10;
  return `${Number.isInteger(zhe) ? String(zhe) : zhe.toFixed(1)}折`;
}

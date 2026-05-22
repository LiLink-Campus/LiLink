/**
 * Coupon benefit types, statuses, and helpers.
 *
 * Coupons are granted as ISSUED (usable) on activation — there is no manual
 * "claim" step. Effective usability also requires the holder to be ACTIVE,
 * which the server re-checks at redemption time (not encodable here).
 *
 * ⏸️ Coupon *benefit-rule modeling* (conditions / composition / DSL) is
 * deferred to contract §A. M0 ships minimal stubs below so the rest of the
 * system can run without depending on the final rule shape. Consumers MUST go
 * through these helpers and never read `rule` directly, so §A can replace the
 * stubs (with a versioned discriminated union) without touching call sites.
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

// ⏸️ §A placeholder. Replace `CouponRule` with a versioned discriminated union
// (conditions[] AND + benefits[]) when the benefit-rule DSL is designed.
export type CouponRule = Record<string, unknown>;

export interface CouponBenefitDescriptor {
  benefitType: CouponBenefitType;
  title: string;
  faceValue: number; // nominal value in cents; reconciliation anchor
  rule?: CouponRule | null;
}

/** Best-effort human text for a coupon benefit (stub: uses title until §A). */
export function renderBenefitText(benefit: CouponBenefitDescriptor): string {
  return benefit.title;
}

/**
 * Whether redemption requires the merchant to enter an order amount.
 * ⏸️ Stub: always false until §B (and the §A rule shape) are designed.
 */
export function requiresOrderAmount(_rule?: CouponRule | null): boolean {
  return false;
}

/**
 * Validate a coupon rule payload at template creation.
 * ⏸️ Stub: accepts any plain object (or null -> {}) until §A defines the schema.
 */
export function validateCouponRule(rule: unknown): CouponRule {
  if (rule == null) return {};
  if (typeof rule !== "object" || Array.isArray(rule)) {
    throw new Error("Coupon rule must be a plain object");
  }
  return rule as CouponRule;
}

/**
 * Evaluate a coupon rule at redemption time (check conditions, compute the
 * actual discount).
 * ⏸️ Stub: always passes with no computed discount until §A (rule shape) and
 * §B (merchant order-amount entry) are designed.
 */
export function evaluateCoupon(
  _rule: CouponRule | null | undefined,
  _ctx: { orderAmount?: number; now: Date },
): { ok: boolean; reason?: string; computedDiscount?: number } {
  return { ok: true };
}

export const COUPON_STATUSES = ["ISSUED", "REDEEMED", "EXPIRED", "VOID"] as const;
export type CouponStatus = (typeof COUPON_STATUSES)[number];

export const DASHBOARD_COUPON_READ_TARGET = "dashboard.coupons";
/**
 * Manual dashboard coupon read-state version. Maintainers must bump this when
 * semantic coupon agenda/content changes require users to read it again; it is
 * intentionally not auto-derived from coupon rows or templates.
 */
export const DASHBOARD_COUPON_READ_VERSION = "2026-05-27.v1";

/**
 * Whether a coupon is in a redeemable shape. The server additionally enforces
 * `user.status === 'ACTIVE'` at redemption; that is not represented here.
 */
export function isCouponRedeemable(
  coupon: { status: CouponStatus; expiresAt: string | Date | null },
  now: Date = new Date()
): boolean {
  if (coupon.status !== "ISSUED") return false;
  if (coupon.expiresAt == null) return true;
  const expiresAt =
    coupon.expiresAt instanceof Date ? coupon.expiresAt : new Date(coupon.expiresAt);
  return expiresAt.getTime() > now.getTime();
}

/**
 * Effective status for display: an ISSUED coupon past its expiry is reported as
 * EXPIRED so the coupon page can partition stably without a cron job.
 */
export function effectiveCouponStatus(
  coupon: { status: CouponStatus; expiresAt: string | Date | null },
  now: Date = new Date()
): CouponStatus {
  if (coupon.status === "ISSUED" && !isCouponRedeemable(coupon, now)) {
    return "EXPIRED";
  }
  return coupon.status;
}

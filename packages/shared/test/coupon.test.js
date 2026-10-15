const test = require("node:test");
const assert = require("node:assert/strict");
const { effectiveCouponStatus, isCouponRedeemable } = require("../dist");

// ---- status helpers ----

test("isCouponRedeemable honors status + expiry", () => {
  const now = new Date("2026-05-23T00:00:00.000Z");
  assert.equal(isCouponRedeemable({ status: "ISSUED", expiresAt: null }, now), true);
  assert.equal(
    isCouponRedeemable({ status: "ISSUED", expiresAt: "2026-05-22T00:00:00.000Z" }, now),
    false,
  );
  assert.equal(isCouponRedeemable({ status: "REDEEMED", expiresAt: null }, now), false);
});

test("effectiveCouponStatus reports an expired ISSUED coupon as EXPIRED", () => {
  const now = new Date("2026-05-23T00:00:00.000Z");
  assert.equal(
    effectiveCouponStatus({ status: "ISSUED", expiresAt: "2026-05-22T00:00:00.000Z" }, now),
    "EXPIRED",
  );
  assert.equal(effectiveCouponStatus({ status: "ISSUED", expiresAt: null }, now), "ISSUED");
});

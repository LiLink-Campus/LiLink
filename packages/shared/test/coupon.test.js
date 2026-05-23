const test = require("node:test");
const assert = require("node:assert/strict");

const {
  effectiveCouponStatus,
  evaluateCoupon,
  isCouponRedeemable,
  parseCouponRule,
  renderBenefitText,
  requiresOrderAmount,
  validateCouponRule,
} = require("../dist");

// The two real launch coupons (cents). Social: 满减阶梯; Vibes: 满赠阶梯.
const SOCIAL = {
  version: 1,
  tiers: [
    { minSpend: 3000, benefit: { type: "AMOUNT_OFF", amountOff: 500 } },
    { minSpend: 5000, benefit: { type: "AMOUNT_OFF", amountOff: 1200 } },
    { minSpend: 10000, benefit: { type: "AMOUNT_OFF", amountOff: 3000 } },
  ],
};
const VIBES = {
  version: 1,
  tiers: [
    { minSpend: 5000, benefit: { type: "GIFT", description: "一杯气泡饮料" } },
    { minSpend: 10000, benefit: { type: "GIFT", description: "一杯软饮料/半份小食拼盘" } },
    { minSpend: 20000, benefit: { type: "GIFT", description: "两杯任意饮料" } },
  ],
};

// ---- validateCouponRule ----

test("validateCouponRule accepts the real Social / Vibes ladders", () => {
  assert.deepEqual(validateCouponRule(SOCIAL, "FULL_REDUCTION"), SOCIAL);
  assert.deepEqual(validateCouponRule(VIBES, "GIFT"), VIBES);
});

test("validateCouponRule returns null for CUSTOM, rejects a CUSTOM rule with content", () => {
  assert.equal(validateCouponRule(null, "CUSTOM"), null);
  assert.equal(validateCouponRule({}, "CUSTOM"), null);
  assert.throws(() => validateCouponRule(SOCIAL, "CUSTOM"), /CUSTOM/);
});

test("validateCouponRule requires a non-empty ladder for typed coupons", () => {
  assert.throws(() => validateCouponRule(null, "FULL_REDUCTION"), /required/);
  assert.throws(
    () => validateCouponRule({ version: 1, tiers: [] }, "GIFT"),
    /at least one tier/,
  );
});

test("validateCouponRule rejects a benefit kind that mismatches benefitType", () => {
  assert.throws(() => validateCouponRule(SOCIAL, "GIFT"), /benefit type must be GIFT/);
});

test("validateCouponRule rejects non-increasing minSpend", () => {
  const bad = {
    version: 1,
    tiers: [
      { minSpend: 5000, benefit: { type: "AMOUNT_OFF", amountOff: 500 } },
      { minSpend: 3000, benefit: { type: "AMOUNT_OFF", amountOff: 800 } },
    ],
  };
  assert.throws(() => validateCouponRule(bad, "FULL_REDUCTION"), /increasing/);
});

test("validateCouponRule rejects amountOff exceeding its minSpend", () => {
  const bad = {
    version: 1,
    tiers: [{ minSpend: 3000, benefit: { type: "AMOUNT_OFF", amountOff: 4000 } }],
  };
  assert.throws(() => validateCouponRule(bad, "FULL_REDUCTION"), /cannot exceed/);
});

test("validateCouponRule validates and bounds PERCENT_OFF", () => {
  const ok = {
    version: 1,
    tiers: [
      { minSpend: 5000, benefit: { type: "PERCENT_OFF", percentOff: 20, maxOff: 2000 } },
    ],
  };
  assert.deepEqual(validateCouponRule(ok, "DISCOUNT"), ok);
  const tooHigh = {
    version: 1,
    tiers: [{ minSpend: 5000, benefit: { type: "PERCENT_OFF", percentOff: 100 } }],
  };
  assert.throws(() => validateCouponRule(tooHigh, "DISCOUNT"), /between 1 and 99/);
});

// ---- parseCouponRule ----

test("parseCouponRule returns null for non-rule / malformed input (never throws)", () => {
  assert.equal(parseCouponRule(null), null);
  assert.equal(parseCouponRule({}), null);
  assert.equal(parseCouponRule({ version: 2, tiers: [] }), null);
  assert.equal(parseCouponRule({ version: 1, tiers: [{ minSpend: -1 }] }), null);
});

test("parseCouponRule round-trips a valid stored rule", () => {
  assert.deepEqual(parseCouponRule(SOCIAL), SOCIAL);
});

// ---- requiresOrderAmount ----

test("requiresOrderAmount is true for amount-keyed ladders, false otherwise", () => {
  assert.equal(requiresOrderAmount(SOCIAL), true);
  assert.equal(requiresOrderAmount(VIBES), true);
  assert.equal(requiresOrderAmount(null), false);
  const flat = {
    version: 1,
    tiers: [{ minSpend: 0, benefit: { type: "AMOUNT_OFF", amountOff: 500 } }],
  };
  assert.equal(requiresOrderAmount(flat), false);
  // A percentage benefit always needs the amount, even with no threshold.
  const noThresholdPercent = {
    version: 1,
    tiers: [{ minSpend: 0, benefit: { type: "PERCENT_OFF", percentOff: 20 } }],
  };
  assert.equal(requiresOrderAmount(noThresholdPercent), true);
});

// ---- evaluateCoupon ----

test("evaluateCoupon picks the highest met tier (Social 满减)", () => {
  const r = evaluateCoupon(SOCIAL, { orderAmount: 6000 });
  assert.equal(r.ok, true);
  assert.equal(r.discount, 1200); // 满50减12
  assert.equal(r.gift, null);
  assert.equal(r.appliedTier.minSpend, 5000);
});

test("evaluateCoupon picks the top tier when far above all thresholds", () => {
  const r = evaluateCoupon(SOCIAL, { orderAmount: 50000 });
  assert.equal(r.discount, 3000);
});

test("evaluateCoupon returns a gift for a Vibes tier", () => {
  const r = evaluateCoupon(VIBES, { orderAmount: 12000 });
  assert.equal(r.ok, true);
  assert.equal(r.discount, 0);
  assert.equal(r.gift, "一杯软饮料/半份小食拼盘");
});

test("evaluateCoupon: NEED_AMOUNT when an amount-keyed rule has no amount", () => {
  const r = evaluateCoupon(SOCIAL, {});
  assert.equal(r.ok, false);
  assert.equal(r.reason, "NEED_AMOUNT");
});

test("evaluateCoupon: BELOW_THRESHOLD when the amount meets no tier", () => {
  const r = evaluateCoupon(SOCIAL, { orderAmount: 2000 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "BELOW_THRESHOLD");
});

test("evaluateCoupon computes and caps PERCENT_OFF", () => {
  const rule = {
    version: 1,
    tiers: [
      { minSpend: 5000, benefit: { type: "PERCENT_OFF", percentOff: 20, maxOff: 2000 } },
    ],
  };
  // 20% of 80.00 = 16.00 -> under the 20.00 cap
  assert.equal(evaluateCoupon(rule, { orderAmount: 8000 }).discount, 1600);
  // 20% of 200.00 = 40.00 -> capped at 20.00
  assert.equal(evaluateCoupon(rule, { orderAmount: 20000 }).discount, 2000);
});

test("evaluateCoupon: a no-threshold percentage coupon still needs the amount", () => {
  const rule = {
    version: 1,
    tiers: [{ minSpend: 0, benefit: { type: "PERCENT_OFF", percentOff: 20 } }],
  };
  const noAmount = evaluateCoupon(rule, {});
  assert.equal(noAmount.ok, false);
  assert.equal(noAmount.reason, "NEED_AMOUNT");
  // With an amount it computes the percentage discount.
  assert.equal(evaluateCoupon(rule, { orderAmount: 10000 }).discount, 2000);
});

test("evaluateCoupon passes a CUSTOM / no-rule coupon with no discount or amount", () => {
  const r = evaluateCoupon(null, {});
  assert.equal(r.ok, true);
  assert.equal(r.discount, 0);
  assert.equal(r.gift, null);
  assert.equal(r.appliedTier, null);
});

// ---- renderBenefitText ----

test("renderBenefitText renders the Social 满减 ladder", () => {
  assert.equal(
    renderBenefitText({ benefitType: "FULL_REDUCTION", title: "Social", faceValue: 3000, rule: SOCIAL }),
    "满30减5 ｜ 满50减12 ｜ 满100减30",
  );
});

test("renderBenefitText renders the Vibes 满赠 ladder", () => {
  assert.equal(
    renderBenefitText({ benefitType: "GIFT", title: "Vibes", faceValue: 0, rule: VIBES }),
    "满50送一杯气泡饮料 ｜ 满100送一杯软饮料/半份小食拼盘 ｜ 满200送两杯任意饮料",
  );
});

test("renderBenefitText formats fractional yuan and percent 折", () => {
  const half = {
    version: 1,
    tiers: [{ minSpend: 5000, benefit: { type: "AMOUNT_OFF", amountOff: 1250 } }],
  };
  assert.equal(
    renderBenefitText({ benefitType: "FULL_REDUCTION", title: "x", faceValue: 0, rule: half }),
    "满50减12.5",
  );
  const pct = {
    version: 1,
    tiers: [{ minSpend: 5000, benefit: { type: "PERCENT_OFF", percentOff: 20, maxOff: 2000 } }],
  };
  assert.equal(
    renderBenefitText({ benefitType: "DISCOUNT", title: "x", faceValue: 0, rule: pct }),
    "满50享8折(最高减20元)",
  );
});

test("renderBenefitText falls back to the title for CUSTOM / no rule", () => {
  assert.equal(
    renderBenefitText({ benefitType: "CUSTOM", title: "到店咨询", faceValue: 0, rule: null }),
    "到店咨询",
  );
});

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

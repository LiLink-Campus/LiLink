const test = require("node:test");
const assert = require("node:assert/strict");

const {
  generateTotpSecret,
  generateTotpToken,
  verifyTotpToken,
  formatRedeemCode,
  parseRedeemCode,
  COUPON_TOTP,
} = require("../dist");

test("token is 6 digits and self-verifies", () => {
  const s = generateTotpSecret();
  const t = generateTotpToken(s);
  assert.match(t, /^\d{6}$/);
  assert.equal(verifyTotpToken(s, t), true);
});

test("rejects token from a different secret", () => {
  const t = generateTotpToken(generateTotpSecret());
  assert.equal(verifyTotpToken(generateTotpSecret(), t), false);
});

test("accepts previous-window token (window=1)", () => {
  const s = generateTotpSecret();
  const prev = generateTotpToken(s, Date.now() - COUPON_TOTP.period * 1000);
  assert.equal(verifyTotpToken(s, prev), true);
});

test("rejects a token two windows old", () => {
  const s = generateTotpSecret();
  const old = generateTotpToken(s, Date.now() - 2 * COUPON_TOTP.period * 1000 - 1000);
  assert.equal(verifyTotpToken(s, old), false);
});

test("rejects non-6-digit tokens", () => {
  const s = generateTotpSecret();
  assert.equal(verifyTotpToken(s, "12345"), false);
  assert.equal(verifyTotpToken(s, "1234567"), false);
  assert.equal(verifyTotpToken(s, "abcdef"), false);
});

test("formatRedeemCode and parseRedeemCode round-trip", () => {
  assert.equal(formatRedeemCode("K7M2QP", "573821"), "K7M2QP-573821");
  assert.deepEqual(parseRedeemCode(" k7m2qp-573821 "), { code: "K7M2QP", token: "573821" });
  assert.equal(parseRedeemCode("bad"), null);
  assert.equal(parseRedeemCode("K7M2QP-12"), null);
});

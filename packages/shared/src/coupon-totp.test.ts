import { describe, it, expect } from "vitest";
import {
  generateTotpSecret, generateTotpToken, verifyTotpToken,
  formatRedeemCode, parseRedeemCode, COUPON_TOTP,
} from "./coupon-totp";

describe("coupon-totp", () => {
  it("token is 6 digits and self-verifies", () => {
    const s = generateTotpSecret();
    const t = generateTotpToken(s);
    expect(t).toMatch(/^\d{6}$/);
    expect(verifyTotpToken(s, t)).toBe(true);
  });
  it("rejects token from a different secret", () => {
    const t = generateTotpToken(generateTotpSecret());
    expect(verifyTotpToken(generateTotpSecret(), t)).toBe(false);
  });
  it("accepts previous-window token (window=1)", () => {
    const s = generateTotpSecret();
    const prev = generateTotpToken(s, Date.now() - COUPON_TOTP.period * 1000);
    expect(verifyTotpToken(s, prev)).toBe(true);
  });
  it("rejects a token two windows old", () => {
    const s = generateTotpSecret();
    const old = generateTotpToken(s, Date.now() - 2 * COUPON_TOTP.period * 1000 - 1000);
    expect(verifyTotpToken(s, old)).toBe(false);
  });
  it("formats and parses redeem code round-trip", () => {
    expect(formatRedeemCode("K7M2QP", "573821")).toBe("K7M2QP-573821");
    expect(parseRedeemCode(" k7m2qp-573821 ")).toEqual({ code: "K7M2QP", token: "573821" });
    expect(parseRedeemCode("bad")).toBeNull();
    expect(parseRedeemCode("K7M2QP-12")).toBeNull();
  });
});

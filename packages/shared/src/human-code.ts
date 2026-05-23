/**
 * Human-friendly short codes shared across recruiter invite codes (8 chars),
 * personal referral codes (10 chars), and coupon redemption codes (10 chars).
 *
 * The lengths MUST stay distinct: the public landing page `/i/:code` routes by
 * code length (8 -> recruiter invite code, 10 -> personal referral code), so a
 * shared length constant keeps generation, DTO validation, and routing aligned.
 */

// Unambiguous uppercase alphanumerics (no I, L, O, 0, 1).
export const HUMAN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const INVITE_CODE_LENGTH = 8; // recruiter invite codes (existing system)
export const PERSONAL_CODE_LENGTH = 10; // per-user personal referral codes
export const COUPON_CODE_LENGTH = 6; // coupon redemption codes

/**
 * Generate a random human-friendly code. Uses Web Crypto (available in Node 20+
 * and browsers) with rejection sampling for an unbiased draw from the alphabet.
 *
 * Pure helper: callers are responsible for DB-uniqueness retries on collision.
 */
export function generateHumanCode({
  length,
  alphabet = HUMAN_CODE_ALPHABET,
}: {
  length: number;
  alphabet?: string;
}): string {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error("generateHumanCode: length must be a positive integer");
  }
  if (alphabet.length < 2) {
    throw new Error("generateHumanCode: alphabet must have at least 2 chars");
  }
  const n = alphabet.length;
  // Largest multiple of n within uint32 range, for unbiased rejection sampling.
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const buf = new Uint32Array(1);
  let code = "";
  while (code.length < length) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0] < limit) {
      code += alphabet[buf[0] % n];
    }
  }
  return code;
}

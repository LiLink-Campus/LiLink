import { Secret, TOTP } from "otpauth";

export const COUPON_TOTP = { period: 60, digits: 6, algorithm: "SHA1", window: 1 } as const;

function totp(secret: string): TOTP {
  return new TOTP({
    secret: Secret.fromBase32(secret),
    algorithm: COUPON_TOTP.algorithm,
    digits: COUPON_TOTP.digits,
    period: COUPON_TOTP.period,
  });
}

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32; // 160-bit
}
export function generateTotpToken(secret: string, at: number = Date.now()): string {
  return totp(secret).generate({ timestamp: at });
}
export function verifyTotpToken(secret: string, token: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const delta = totp(secret).validate({ token, window: COUPON_TOTP.window });
  return delta !== null;
}
export function formatRedeemCode(code: string, token: string): string {
  return `${code}-${token}`;
}
export function parseRedeemCode(input: string): { code: string; token: string } | null {
  const m = input.trim().toUpperCase().match(/^([A-Z0-9]+)-(\d{6})$/);
  return m ? { code: m[1], token: m[2] } : null;
}

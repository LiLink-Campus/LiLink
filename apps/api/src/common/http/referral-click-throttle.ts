// Stricter throttle for the public referral CLICK write endpoint. UV dedup
// already collapses repeats per (code, day, visitor), so this mainly caps an
// attacker rotating User-Agent (changing the visitor hash) to force inserts.
// Tuned above plausible campus-NAT click volume but far below the public-read
// budget. TODO (follow-up): bucket by IP + code for finer-grained control.
const REFERRAL_CLICK_THROTTLE_TTL_MS = 60_000;
const REFERRAL_CLICK_THROTTLE_LIMIT = 1_200;

export function createReferralClickThrottle() {
  return {
    default: {
      ttl: REFERRAL_CLICK_THROTTLE_TTL_MS,
      limit: REFERRAL_CLICK_THROTTLE_LIMIT,
    },
  };
}

const MERCHANT_LOGIN_THROTTLE_TTL_MS = 60_000;
/**
 * @internal Exported for throttling tests.
 */
export const MERCHANT_LOGIN_THROTTLE_LIMIT = 10;

export function createMerchantLoginThrottle() {
  return {
    default: {
      ttl: MERCHANT_LOGIN_THROTTLE_TTL_MS,
      limit: MERCHANT_LOGIN_THROTTLE_LIMIT,
    },
  };
}

const ADMIN_LOGIN_THROTTLE_TTL_MS = 60_000;
/**
 * @internal Exported for throttling tests.
 */
export const ADMIN_LOGIN_THROTTLE_LIMIT = 10;

export function createAdminLoginThrottle() {
  return {
    default: {
      ttl: ADMIN_LOGIN_THROTTLE_TTL_MS,
      limit: ADMIN_LOGIN_THROTTLE_LIMIT,
    },
  };
}

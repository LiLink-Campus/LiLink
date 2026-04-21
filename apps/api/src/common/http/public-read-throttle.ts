const PUBLIC_READ_THROTTLE_TTL_MS = 60_000;
const PUBLIC_READ_THROTTLE_LIMIT = 20_000;

export function createPublicReadThrottle() {
  return {
    default: {
      ttl: PUBLIC_READ_THROTTLE_TTL_MS,
      limit: PUBLIC_READ_THROTTLE_LIMIT,
    },
  };
}

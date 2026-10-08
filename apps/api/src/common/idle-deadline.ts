export const IDLE_POLL_MS = 15 * 60_000;

// Only the default interval is aligned; custom mail intervals retain their
// elapsed-time meaning and no existing recovery deadline is moved later.
export function nextIdleDeadline(now: number, interval = IDLE_POLL_MS) {
  return interval === IDLE_POLL_MS
    ? (Math.floor(now / interval) + 1) * interval
    : now + interval;
}

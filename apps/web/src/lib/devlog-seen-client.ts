import {
  DEVLOG_LAST_SEEN_KEY,
  DEVLOG_LAST_SEEN_UPDATED_EVENT,
} from "./devlog-constants";

export function readDevlogLastSeen(): string | null {
  try {
    return window.localStorage.getItem(DEVLOG_LAST_SEEN_KEY);
  } catch {
    return null;
  }
}

export function writeDevlogLastSeen(latestPublishedAt: string): void {
  try {
    window.localStorage.setItem(DEVLOG_LAST_SEEN_KEY, latestPublishedAt);
    window.dispatchEvent(new CustomEvent(DEVLOG_LAST_SEEN_UPDATED_EVENT));
  } catch {
    // Ignore storage failures (private mode etc.).
  }
}

export function hasUnseenDevlogUpdates(
  latestPublishedAt: string | null,
  lastSeen: string | null,
): boolean {
  if (!latestPublishedAt) {
    return false;
  }
  if (!lastSeen) {
    return true;
  }
  return latestPublishedAt > lastSeen;
}

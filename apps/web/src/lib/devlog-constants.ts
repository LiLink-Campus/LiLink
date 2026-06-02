/** localStorage key tracking the latest update date the visitor has already seen. */
export const DEVLOG_LAST_SEEN_KEY = "lilink.devlog.lastSeen";

/** Dispatched on `window` after {@link DEVLOG_LAST_SEEN_KEY} is written (same tab). */
export const DEVLOG_LAST_SEEN_UPDATED_EVENT = "lilink:devlog-last-seen-updated";

/** Max items in devlog `/updates.json`; keep in sync with lilink-devlog. */
export const DEVLOG_UPDATES_FEED_LIMIT = 50;

/** Items per page on `/updates`. */
export const DEVLOG_UPDATES_PAGE_SIZE = 12;

/** Homepage "recent updates" strip. */
export const DEVLOG_UPDATES_HOMEPAGE_COUNT = 3;

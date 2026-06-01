import "server-only";

import { cache } from "react";
import {
  DEFAULT_DEVLOG_BASE_URL,
  LOCAL_DEVLOG_DEV_URL,
  getDevlogBaseUrl,
  isDevlogFeedTruncated,
  normalizeFeed,
  paginateDevlogItems,
  parseDevlogUpdatesPage,
  type DevlogFeed,
  type DevlogFeedResponse,
  type DevlogPaginatedSlice,
  type DevlogUpdate,
} from "./devlog-feed-utils";

export type { DevlogFeed, DevlogPaginatedSlice, DevlogUpdate };
export {
  getDevlogBaseUrl,
  isDevlogFeedTruncated,
  paginateDevlogItems,
  parseDevlogUpdatesPage,
};

function devlogFetchInit(): RequestInit {
  return {
    headers: { Accept: "application/json" },
    ...(process.env.NODE_ENV === "development"
      ? { cache: "no-store" as const }
      : { next: { revalidate: 3600 } }),
  };
}

const fetchDevlogFeedFromBase = cache(
  async (baseUrl: string): Promise<DevlogFeed | null> => {
    try {
      const response = await fetch(
        `${baseUrl.replace(/\/$/, "")}/updates.json`,
        devlogFetchInit(),
      );
      if (!response.ok) {
        console.warn(
          `[devlog-feed] ${baseUrl}/updates.json status ${response.status}`,
        );
        return null;
      }
      const raw = (await response.json()) as DevlogFeedResponse;
      if (!Array.isArray(raw?.items)) {
        console.warn("[devlog-feed] missing items array");
        return null;
      }
      return normalizeFeed(raw);
    } catch (error) {
      console.warn(`[devlog-feed] fetch failed (${baseUrl})`, error);
      return null;
    }
  },
);

/**
 * Fetch the devlog update feed. Resilient by design: any failure (network,
 * non-200, malformed JSON) resolves to an empty feed so the marketing site
 * never breaks when devlog is unavailable.
 */
export async function getDevlogFeed(): Promise<DevlogFeed> {
  const configuredBase = getDevlogBaseUrl();
  const primary = await fetchDevlogFeedFromBase(configuredBase);
  if (primary) {
    return primary;
  }

  if (
    process.env.NODE_ENV === "development" &&
    !process.env.DEVLOG_BASE_URL?.trim() &&
    configuredBase === DEFAULT_DEVLOG_BASE_URL
  ) {
    const localFeed = await fetchDevlogFeedFromBase(LOCAL_DEVLOG_DEV_URL);
    if (localFeed) {
      console.info(
        `[devlog-feed] using local devlog at ${LOCAL_DEVLOG_DEV_URL} (production feed unavailable)`,
      );
      return localFeed;
    }
  }

  return {
    generatedAt: new Date(0).toISOString(),
    latestPublishedAt: null,
    totalPublished: 0,
    items: [],
  };
}

/** A capped slice of the devlog feed for list/home sections. */
export async function getDevlogUpdates(limit?: number): Promise<DevlogUpdate[]> {
  const feed = await getDevlogFeed();
  if (limit == null || limit >= feed.items.length) {
    return feed.items;
  }
  return feed.items.slice(0, limit);
}

/**
 * The most recent update's publish date, or null when unavailable. Derived from
 * the single feed source of truth so the nav NEW badge (via /api/devlog/latest)
 * and the /updates mark-seen write always compare the exact same value.
 */
export async function getLatestDevlogPublishedAt(): Promise<string | null> {
  const feed = await getDevlogFeed();
  return feed.latestPublishedAt;
}

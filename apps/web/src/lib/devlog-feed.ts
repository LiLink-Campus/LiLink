import "server-only";

import { cache } from "react";
import { DEVLOG_UPDATES_FEED_LIMIT } from "./devlog-constants";

const DEFAULT_DEVLOG_BASE_URL = "https://devlog.lilink.top";
/** Astro dev server default when DEVLOG_BASE_URL is unset in local web dev. */
const LOCAL_DEVLOG_DEV_URL = "http://127.0.0.1:4321";

/** A single product update, mirrored from the devlog `/updates.json` feed. */
export interface DevlogUpdate {
  title: string;
  summary: string;
  publishedAt: string; // ISO date (YYYY-MM-DD)
  updatedAt: string | null;
  url: string; // absolute devlog URL
  tags: string[];
  cover: string | null;
  featured: boolean;
}

export interface DevlogFeed {
  generatedAt: string;
  latestPublishedAt: string | null;
  totalPublished: number;
  items: DevlogUpdate[];
}

interface DevlogFeedResponse {
  generatedAt?: string;
  latestPublishedAt?: string | null;
  totalPublished?: number;
  items?: DevlogUpdate[];
}

interface DevlogLatestResponse {
  latestPublishedAt?: string | null;
}

/** Devlog origin; overridable via env, defaults to production. */
export function getDevlogBaseUrl(): string {
  return process.env.DEVLOG_BASE_URL?.trim() || DEFAULT_DEVLOG_BASE_URL;
}

function devlogFetchInit(): RequestInit {
  return {
    headers: { Accept: "application/json" },
    ...(process.env.NODE_ENV === "development"
      ? { cache: "no-store" as const }
      : { next: { revalidate: 3600 } }),
  };
}

function normalizeFeed(raw: DevlogFeedResponse): DevlogFeed {
  const items = Array.isArray(raw.items) ? raw.items : [];
  const sortedItems = [...items].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );
  const latestPublishedAt =
    raw.latestPublishedAt ?? sortedItems[0]?.publishedAt ?? null;
  const totalPublished = raw.totalPublished ?? sortedItems.length;

  return {
    generatedAt: raw.generatedAt ?? new Date(0).toISOString(),
    latestPublishedAt,
    totalPublished,
    items: sortedItems.slice(0, DEVLOG_UPDATES_FEED_LIMIT),
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

const fetchDevlogLatestFromBase = cache(
  async (baseUrl: string): Promise<string | null> => {
    try {
      const response = await fetch(
        `${baseUrl.replace(/\/$/, "")}/latest.json`,
        devlogFetchInit(),
      );
      if (!response.ok) {
        return null;
      }
      const raw = (await response.json()) as DevlogLatestResponse;
      return raw.latestPublishedAt ?? null;
    } catch {
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

/** The most recent update's publish date, or null when unavailable. */
export async function getLatestDevlogPublishedAt(): Promise<string | null> {
  const configuredBase = getDevlogBaseUrl();
  const primary = await fetchDevlogLatestFromBase(configuredBase);
  if (primary) {
    return primary;
  }

  if (
    process.env.NODE_ENV === "development" &&
    !process.env.DEVLOG_BASE_URL?.trim() &&
    configuredBase === DEFAULT_DEVLOG_BASE_URL
  ) {
    const localLatest = await fetchDevlogLatestFromBase(LOCAL_DEVLOG_DEV_URL);
    if (localLatest) {
      return localLatest;
    }
  }

  const feed = await getDevlogFeed();
  return feed.latestPublishedAt;
}

/** Whether the devlog has more published posts than we show on /updates. */
export function isDevlogFeedTruncated(feed: DevlogFeed): boolean {
  return feed.totalPublished > feed.items.length;
}

export interface DevlogPaginatedSlice<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export function parseDevlogUpdatesPage(
  raw: string | string[] | undefined,
): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

export function paginateDevlogItems<T>(
  items: T[],
  page: number,
  pageSize: number,
): DevlogPaginatedSlice<T> {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    totalItems,
    totalPages,
  };
}

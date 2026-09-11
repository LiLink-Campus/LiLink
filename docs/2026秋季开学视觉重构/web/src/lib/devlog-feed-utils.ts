import { DEVLOG_UPDATES_FEED_LIMIT } from "./devlog-constants";

export const DEFAULT_DEVLOG_BASE_URL = "https://devlog.lilink.top";
/** Astro dev server default when DEVLOG_BASE_URL is unset in local web dev. */
export const LOCAL_DEVLOG_DEV_URL = "http://127.0.0.1:4321";

/** A single product update, mirrored from the devlog `/updates.json` feed. */
export interface DevlogUpdate {
  title: string;
  summary: string;
  publishedAt: string; // ISO date (YYYY-MM-DD)
  url: string; // absolute devlog URL
  tags: string[];
}

export interface DevlogFeed {
  generatedAt: string;
  latestPublishedAt: string | null;
  totalPublished: number;
  items: DevlogUpdate[];
}

export interface DevlogFeedResponse {
  generatedAt?: string;
  latestPublishedAt?: string | null;
  totalPublished?: number;
  items?: unknown;
}

/** Devlog origin; overridable via env, defaults to production. */
export function getDevlogBaseUrl(): string {
  return process.env.DEVLOG_BASE_URL?.trim() || DEFAULT_DEVLOG_BASE_URL;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Defense in depth on top of the contract-shape checks: a feed entry's url is
 * only trusted when it is an http(s) URL whose origin is in the devlog
 * allowlist. This prevents a compromised or misconfigured feed from injecting
 * arbitrary external links (e.g. https://evil.com/x) that we would otherwise
 * render as outbound hrefs.
 */
export function isAllowedDevlogUrl(
  value: string,
  allowedOrigins: string[],
): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    return allowedOrigins.includes(url.origin);
  } catch {
    return false;
  }
}

/**
 * Origins trusted for devlog item urls: always the configured/default devlog
 * origin, plus the local Astro dev origin in development so a locally served
 * feed is not dropped. Wrapped in try/catch so a malformed env value degrades
 * to the default origin rather than throwing.
 */
export function getAllowedDevlogOrigins(): string[] {
  const origins: string[] = [];
  try {
    origins.push(new URL(getDevlogBaseUrl()).origin);
  } catch {
    // Ignore: fall through to the default origin below.
  }
  if (origins.length === 0) {
    try {
      origins.push(new URL(DEFAULT_DEVLOG_BASE_URL).origin);
    } catch {
      // Unreachable for the hard-coded default, but keep the guard total.
    }
  }
  if (process.env.NODE_ENV === "development") {
    try {
      const localOrigin = new URL(LOCAL_DEVLOG_DEV_URL).origin;
      if (!origins.includes(localOrigin)) {
        origins.push(localOrigin);
      }
    } catch {
      // Ignore a malformed local dev url.
    }
  }
  return origins;
}

/**
 * Validate and coerce one raw feed entry. Returns null for items missing a
 * required string field or carrying a url that is not an http(s) URL on an
 * allowed devlog origin, so a single malformed entry from a 200-but-broken
 * feed can never crash a render or throw inside the sort. `tags` defaults to []
 * and non-string tags are dropped.
 */
export function sanitizeDevlogItem(
  raw: unknown,
  allowedOrigins: string[],
): DevlogUpdate | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const item = raw as Record<string, unknown>;
  if (
    !isNonEmptyString(item.title) ||
    !isNonEmptyString(item.summary) ||
    !isNonEmptyString(item.publishedAt) ||
    !isNonEmptyString(item.url) ||
    !isAllowedDevlogUrl(item.url, allowedOrigins)
  ) {
    return null;
  }
  return {
    title: item.title,
    summary: item.summary,
    publishedAt: item.publishedAt,
    url: item.url,
    tags: Array.isArray(item.tags) ? item.tags.filter(isNonEmptyString) : [],
  };
}

/**
 * Normalize an untrusted `/updates.json` payload into a {@link DevlogFeed}:
 * drop malformed items, sort by publishedAt desc, then cap to the feed limit.
 * `allowedOrigins` gates which item urls are trusted (see sanitizeDevlogItem).
 */
export function normalizeFeed(
  raw: DevlogFeedResponse,
  allowedOrigins: string[],
): DevlogFeed {
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const sortedItems = rawItems
    .map((item) => sanitizeDevlogItem(item, allowedOrigins))
    .filter((item): item is DevlogUpdate => item !== null)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const latestPublishedAt =
    (isNonEmptyString(raw.latestPublishedAt) ? raw.latestPublishedAt : null) ??
    sortedItems[0]?.publishedAt ??
    null;
  const totalPublished =
    typeof raw.totalPublished === "number" && raw.totalPublished >= 0
      ? raw.totalPublished
      : sortedItems.length;

  return {
    generatedAt: isNonEmptyString(raw.generatedAt)
      ? raw.generatedAt
      : new Date(0).toISOString(),
    latestPublishedAt,
    totalPublished,
    items: sortedItems.slice(0, DEVLOG_UPDATES_FEED_LIMIT),
  };
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

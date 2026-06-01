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

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validate and coerce one raw feed entry. Returns null for items missing a
 * required string field or carrying a non-http(s) url, so a single malformed
 * entry from a 200-but-broken feed can never crash a render or throw inside the
 * sort. `tags` defaults to [] and non-string tags are dropped.
 */
export function sanitizeDevlogItem(raw: unknown): DevlogUpdate | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const item = raw as Record<string, unknown>;
  if (
    !isNonEmptyString(item.title) ||
    !isNonEmptyString(item.summary) ||
    !isNonEmptyString(item.publishedAt) ||
    !isNonEmptyString(item.url) ||
    !isHttpUrl(item.url)
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
 */
export function normalizeFeed(raw: DevlogFeedResponse): DevlogFeed {
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const sortedItems = rawItems
    .map(sanitizeDevlogItem)
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

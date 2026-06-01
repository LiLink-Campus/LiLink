import "server-only";

const DEFAULT_DEVLOG_BASE_URL = "https://devlog.lilink.top";

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

interface DevlogFeed {
  generatedAt: string;
  items: DevlogUpdate[];
}

/** Devlog origin; overridable via env, defaults to production. */
export function getDevlogBaseUrl(): string {
  return process.env.DEVLOG_BASE_URL?.trim() || DEFAULT_DEVLOG_BASE_URL;
}

/**
 * Fetch the devlog update feed. Resilient by design: any failure (network,
 * non-200, malformed JSON) resolves to an empty list so the marketing site
 * never breaks when devlog is unavailable.
 */
export async function getDevlogUpdates(): Promise<DevlogUpdate[]> {
  try {
    const response = await fetch(`${getDevlogBaseUrl()}/updates.json`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!response.ok) {
      console.warn(`[devlog-feed] unexpected status ${response.status}`);
      return [];
    }
    const feed = (await response.json()) as DevlogFeed;
    if (!Array.isArray(feed?.items)) {
      console.warn("[devlog-feed] missing items array");
      return [];
    }
    // Defensive: ensure newest-first even if the source ordering changes.
    return [...feed.items].sort((a, b) =>
      b.publishedAt.localeCompare(a.publishedAt),
    );
  } catch (error) {
    console.warn("[devlog-feed] fetch failed", error);
    return [];
  }
}

/** The most recent update's publish date, or null when unavailable. */
export async function getLatestDevlogPublishedAt(): Promise<string | null> {
  const updates = await getDevlogUpdates();
  return updates[0]?.publishedAt ?? null;
}

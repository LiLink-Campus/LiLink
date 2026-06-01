import { describe, expect, it } from "vitest";
import { DEVLOG_UPDATES_FEED_LIMIT } from "./devlog-constants";
import {
  isDevlogFeedTruncated,
  normalizeFeed,
  paginateDevlogItems,
  parseDevlogUpdatesPage,
  sanitizeDevlogItem,
  type DevlogFeed,
  type DevlogUpdate,
} from "./devlog-feed-utils";

const validRaw = {
  title: "Launch",
  summary: "We shipped it",
  publishedAt: "2026-05-27",
  url: "https://devlog.lilink.top/posts/launch",
  tags: ["产品", "上线"],
};

describe("sanitizeDevlogItem", () => {
  it("accepts a well-formed item and keeps only contract fields", () => {
    expect(
      sanitizeDevlogItem({ ...validRaw, cover: "x.webp", featured: true }),
    ).toEqual({
      title: "Launch",
      summary: "We shipped it",
      publishedAt: "2026-05-27",
      url: "https://devlog.lilink.top/posts/launch",
      tags: ["产品", "上线"],
    });
  });

  it("defaults tags to [] when missing or not an array", () => {
    expect(sanitizeDevlogItem({ ...validRaw, tags: undefined })?.tags).toEqual(
      [],
    );
    expect(sanitizeDevlogItem({ ...validRaw, tags: null })?.tags).toEqual([]);
    expect(sanitizeDevlogItem({ ...validRaw, tags: "nope" })?.tags).toEqual([]);
  });

  it("drops non-string tags", () => {
    expect(
      sanitizeDevlogItem({ ...validRaw, tags: ["ok", 1, null, "fine"] })?.tags,
    ).toEqual(["ok", "fine"]);
  });

  it("rejects items missing a required string field", () => {
    for (const field of ["title", "summary", "publishedAt", "url"]) {
      expect(sanitizeDevlogItem({ ...validRaw, [field]: undefined })).toBeNull();
      expect(sanitizeDevlogItem({ ...validRaw, [field]: "" })).toBeNull();
      expect(sanitizeDevlogItem({ ...validRaw, [field]: 123 })).toBeNull();
    }
  });

  it("rejects non-http(s) urls (javascript:, data:, relative)", () => {
    expect(
      sanitizeDevlogItem({ ...validRaw, url: "javascript:alert(1)" }),
    ).toBeNull();
    expect(sanitizeDevlogItem({ ...validRaw, url: "data:text/html,x" })).toBeNull();
    expect(sanitizeDevlogItem({ ...validRaw, url: "/posts/launch" })).toBeNull();
  });

  it("rejects non-object input", () => {
    expect(sanitizeDevlogItem(null)).toBeNull();
    expect(sanitizeDevlogItem("str")).toBeNull();
    expect(sanitizeDevlogItem(undefined)).toBeNull();
  });
});

describe("normalizeFeed", () => {
  it("drops malformed items instead of throwing or discarding the whole feed", () => {
    const feed = normalizeFeed({
      items: [
        validRaw,
        { title: "no other fields" }, // dropped
        { ...validRaw, publishedAt: "2026-06-01", url: "https://devlog.lilink.top/p/2" },
      ],
    });
    expect(feed.items).toHaveLength(2);
    // newest first
    expect(feed.items[0]?.publishedAt).toBe("2026-06-01");
    expect(feed.items[1]?.publishedAt).toBe("2026-05-27");
  });

  it("does not throw when an item is missing publishedAt (no poisoned sort)", () => {
    expect(() =>
      normalizeFeed({ items: [{ ...validRaw, publishedAt: undefined }, validRaw] }),
    ).not.toThrow();
  });

  it("derives latestPublishedAt from the newest item when absent", () => {
    const feed = normalizeFeed({
      items: [
        { ...validRaw, publishedAt: "2026-05-01", url: "https://d.tld/1" },
        { ...validRaw, publishedAt: "2026-05-09", url: "https://d.tld/2" },
      ],
    });
    expect(feed.latestPublishedAt).toBe("2026-05-09");
  });

  it("prefers an explicit latestPublishedAt and totalPublished", () => {
    const feed = normalizeFeed({
      latestPublishedAt: "2026-07-01",
      totalPublished: 99,
      items: [validRaw],
    });
    expect(feed.latestPublishedAt).toBe("2026-07-01");
    expect(feed.totalPublished).toBe(99);
  });

  it("falls back when latestPublishedAt/totalPublished have wrong types", () => {
    const feed = normalizeFeed({
      latestPublishedAt: 123 as unknown as string,
      totalPublished: -5,
      items: [validRaw],
    });
    expect(feed.latestPublishedAt).toBe("2026-05-27");
    expect(feed.totalPublished).toBe(1);
  });

  it("returns an empty feed for a non-array items field", () => {
    const feed = normalizeFeed({ items: "nope" });
    expect(feed.items).toEqual([]);
    expect(feed.latestPublishedAt).toBeNull();
    expect(feed.totalPublished).toBe(0);
  });

  it("caps items at DEVLOG_UPDATES_FEED_LIMIT", () => {
    const many = Array.from(
      { length: DEVLOG_UPDATES_FEED_LIMIT + 10 },
      (_, i) => ({
        ...validRaw,
        publishedAt: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
        url: `https://devlog.lilink.top/p/${i}`,
      }),
    );
    expect(normalizeFeed({ items: many }).items).toHaveLength(
      DEVLOG_UPDATES_FEED_LIMIT,
    );
  });
});

describe("parseDevlogUpdatesPage", () => {
  it("defaults to 1 for missing/invalid/out-of-range values", () => {
    expect(parseDevlogUpdatesPage(undefined)).toBe(1);
    expect(parseDevlogUpdatesPage("")).toBe(1);
    expect(parseDevlogUpdatesPage("abc")).toBe(1);
    expect(parseDevlogUpdatesPage("0")).toBe(1);
    expect(parseDevlogUpdatesPage("-3")).toBe(1);
  });

  it("parses valid pages and takes the first of an array", () => {
    expect(parseDevlogUpdatesPage("4")).toBe(4);
    expect(parseDevlogUpdatesPage("3abc")).toBe(3);
    expect(parseDevlogUpdatesPage(["2", "5"])).toBe(2);
  });
});

describe("paginateDevlogItems", () => {
  const items = Array.from({ length: 25 }, (_, i) => i);

  it("returns the requested page slice", () => {
    const p = paginateDevlogItems(items, 2, 12);
    expect(p.items).toEqual(items.slice(12, 24));
    expect(p.page).toBe(2);
    expect(p.totalPages).toBe(3);
    expect(p.totalItems).toBe(25);
  });

  it("clamps an out-of-range page to the last page", () => {
    const p = paginateDevlogItems(items, 999, 12);
    expect(p.page).toBe(3);
    expect(p.items).toEqual(items.slice(24));
  });

  it("clamps page < 1 to 1", () => {
    expect(paginateDevlogItems(items, 0, 12).page).toBe(1);
  });

  it("handles an empty list with totalPages 1", () => {
    const p = paginateDevlogItems([], 1, 12);
    expect(p.items).toEqual([]);
    expect(p.totalPages).toBe(1);
    expect(p.page).toBe(1);
  });
});

describe("isDevlogFeedTruncated", () => {
  const base: DevlogFeed = {
    generatedAt: "1970-01-01T00:00:00.000Z",
    latestPublishedAt: null,
    totalPublished: 0,
    items: [],
  };
  const items = (n: number): DevlogUpdate[] =>
    Array.from({ length: n }, () => ({ ...validRaw }));

  it("is true when more posts exist than are shown", () => {
    expect(
      isDevlogFeedTruncated({ ...base, totalPublished: 60, items: items(50) }),
    ).toBe(true);
  });

  it("is false when all posts are shown", () => {
    expect(
      isDevlogFeedTruncated({ ...base, totalPublished: 3, items: items(3) }),
    ).toBe(false);
  });
});

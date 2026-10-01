import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// devlog-feed.ts imports "server-only", which throws when loaded outside a
// React Server Component bundle (i.e. in this node test env). Stub it out.
vi.mock("server-only", () => ({}));

const BASE_URL = "https://devlog.lilink.top";

type DevlogFeedModule = typeof import("./devlog-feed");

/**
 * fetchDevlogFeedFromBase is wrapped in React's cache(). Reset modules and
 * re-import per test so each case starts from a clean module + cache state and
 * picks up the fetch stub installed for that case.
 */
async function loadModule(): Promise<DevlogFeedModule> {
  vi.resetModules();
  return import("./devlog-feed");
}

/** Minimal fetch Response stand-in; only the bits the feed reads are present. */
function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
  } as unknown as Response;
}

function stubFetch(impl: () => Promise<Response>): void {
  vi.stubGlobal("fetch", vi.fn(impl));
}

const validItem = {
  title: "Launch",
  summary: "We shipped it",
  publishedAt: "2026-05-27",
  url: `${BASE_URL}/posts/launch`,
  tags: ["产品"],
};

beforeEach(() => {
  // Under vitest NODE_ENV is "test", so the local dev fallback is not taken.
  process.env.DEVLOG_BASE_URL = BASE_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DEVLOG_BASE_URL;
});

describe("getDevlogFeed (resilient degradation)", () => {
  it("returns an empty feed on a non-200 response without throwing", async () => {
    stubFetch(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      } as unknown as Response),
    );
    const { getDevlogFeed } = await loadModule();
    const feed = await getDevlogFeed();
    expect(feed.items).toEqual([]);
    expect(feed.latestPublishedAt).toBeNull();
    expect(feed.totalPublished).toBe(0);
  });

  it("returns an empty feed when items is not an array", async () => {
    stubFetch(() => Promise.resolve(jsonResponse({ items: "nope" })));
    const { getDevlogFeed } = await loadModule();
    const feed = await getDevlogFeed();
    expect(feed.items).toEqual([]);
    expect(feed.latestPublishedAt).toBeNull();
    expect(feed.totalPublished).toBe(0);
  });

  it("returns an empty feed when the body is not valid JSON", async () => {
    stubFetch(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("bad json")),
      } as unknown as Response),
    );
    const { getDevlogFeed } = await loadModule();
    const feed = await getDevlogFeed();
    expect(feed.items).toEqual([]);
    expect(feed.totalPublished).toBe(0);
  });

  it("returns an empty feed on a network error without throwing", async () => {
    stubFetch(() => Promise.reject(new Error("network down")));
    const { getDevlogFeed } = await loadModule();
    const feed = await getDevlogFeed();
    expect(feed.items).toEqual([]);
    expect(feed.latestPublishedAt).toBeNull();
    expect(feed.totalPublished).toBe(0);
  });

  it("parses a valid payload and sorts items newest-first", async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse({
          generatedAt: "2026-06-01T00:00:00.000Z",
          items: [
            { ...validItem, publishedAt: "2026-05-01", url: `${BASE_URL}/a` },
            { ...validItem, publishedAt: "2026-06-01", url: `${BASE_URL}/c` },
            { ...validItem, publishedAt: "2026-05-15", url: `${BASE_URL}/b` },
          ],
        }),
      ),
    );
    const { getDevlogFeed } = await loadModule();
    const feed = await getDevlogFeed();
    expect(feed.items.map((i) => i.publishedAt)).toEqual([
      "2026-06-01",
      "2026-05-15",
      "2026-05-01",
    ]);
    expect(feed.latestPublishedAt).toBe("2026-06-01");
  });
});

describe("getDevlogUpdates", () => {
  it("truncates a normal feed to the requested limit", async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse({
          items: [
            { ...validItem, publishedAt: "2026-06-03", url: `${BASE_URL}/3` },
            { ...validItem, publishedAt: "2026-06-02", url: `${BASE_URL}/2` },
            { ...validItem, publishedAt: "2026-06-01", url: `${BASE_URL}/1` },
          ],
        }),
      ),
    );
    const { getDevlogUpdates } = await loadModule();
    const updates = await getDevlogUpdates(2);
    expect(updates).toHaveLength(2);
    expect(updates.map((u) => u.publishedAt)).toEqual([
      "2026-06-03",
      "2026-06-02",
    ]);
  });
});

describe("getLatestDevlogPublishedAt", () => {
  it("returns the feed's latestPublishedAt", async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse({
          latestPublishedAt: "2026-07-04",
          items: [validItem],
        }),
      ),
    );
    const { getLatestDevlogPublishedAt } = await loadModule();
    expect(await getLatestDevlogPublishedAt()).toBe("2026-07-04");
  });

  it("returns null when the feed is unavailable", async () => {
    stubFetch(() => Promise.reject(new Error("network down")));
    const { getLatestDevlogPublishedAt } = await loadModule();
    expect(await getLatestDevlogPublishedAt()).toBeNull();
  });
});

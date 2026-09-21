import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./api-base-url", () => ({ getServerApiBaseUrl: async () => "http://api.test" }));
vi.mock("next/cache", () => ({ unstable_cache: vi.fn((fn) => fn) }));
import { unstable_cache } from "next/cache";
import { getCachedPublicData } from "./public-data-cache";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("anonymous public data cache", () => {
  it("caches only anonymous requests and uses separate refresh intervals", async () => {
    const request = vi.fn().mockImplementation(async () => Response.json({ total: 42 }));
    vi.stubGlobal("fetch", request);
    await expect(getCachedPublicData("/public/community")).resolves.toEqual({ total: 42 });
    expect(unstable_cache).toHaveBeenLastCalledWith(expect.any(Function), ["public-data-v1"], { revalidate: 30 });
    await getCachedPublicData("/public/schools");
    expect(unstable_cache).toHaveBeenLastCalledWith(expect.any(Function), ["public-data-v1"], { revalidate: 60 });
    await getCachedPublicData("/public/landing");
    expect(unstable_cache).toHaveBeenLastCalledWith(expect.any(Function), ["public-data-v1"], { revalidate: 60 });
    for (const [, options] of request.mock.calls) {
      expect(options.headers).toEqual({ Accept: "application/json" });
      expect(options).not.toHaveProperty("credentials");
    }
  });

  it("recovers once after a gateway failure", async () => {
    const request = vi.fn().mockResolvedValueOnce(new Response(null, { status: 520 }))
      .mockResolvedValueOnce(Response.json({ total: 42 }));
    vi.stubGlobal("fetch", request);
    await expect(getCachedPublicData("/public/community")).resolves.toEqual({ total: 42 });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("throws on upstream failure instead of caching a zero or null", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const request = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", request);
    await expect(getCachedPublicData("/public/community")).rejects.toThrow("unavailable");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not replay rate-limited requests or cache error JSON", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const request = vi.fn().mockResolvedValue(Response.json({ message: "private gateway detail" }, { status: 429 }));
    vi.stubGlobal("fetch", request);
    await expect(getCachedPublicData("/public/community")).rejects.toThrow("HTTP 429");
    expect(request).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledWith("[public-data] /public/community: HTTP 429");
  });

  it("bounds a stalled body to two 4-second attempts", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const request = vi.fn((_url, options: RequestInit) => Promise.resolve({
      ok: true,
      json: () => new Promise((_resolve, reject) => {
        options.signal!.addEventListener("abort", () => reject(new Error("stalled")), { once: true });
      }),
    }));
    vi.stubGlobal("fetch", request);
    const result = expect(getCachedPublicData("/public/community")).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(8_000);
    await result;
    expect(request).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const pools = vi.hoisted(() => [] as Array<{ origin: string; options: { connect: { lookup: (...args: unknown[]) => void } }; close: ReturnType<typeof vi.fn> }>);
vi.mock("undici", () => ({
  Pool: class {
    close = vi.fn().mockResolvedValue(undefined);
    constructor(readonly origin: string, readonly options: typeof pools[number]["options"]) { pools.push(this); }
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
  pools.length = 0;
});

describe("server API connection routing", () => {
  it("uses the ordinary transport when no origin address is configured", async () => {
    vi.stubEnv("SERVER_API_CONNECT_ADDRESS", "");
    const request = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", request);
    const { fetchServerApi } = await import("./server-api-transport");
    await fetchServerApi("http://localhost:4000/v1/health", { cache: "no-store" });
    expect(request).toHaveBeenCalledWith("http://localhost:4000/v1/health", { cache: "no-store" });
    expect(pools).toHaveLength(0);
  });

  it.each([
    ["invalid.test", "https://api.test/v1/health"],
    ["192.0.2.10", "http://api.test/v1/health"],
    ["192.0.2.10", "https://other.test/v1/health"],
  ])("rejects invalid configuration or unexpected destinations", async (address, url) => {
    vi.stubEnv("SERVER_API_CONNECT_ADDRESS", address);
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.test/v1");
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    const { fetchServerApi } = await import("./server-api-transport");
    expect(() => fetchServerApi(url, {})).toThrow("Invalid server API connection configuration");
    expect(request).not.toHaveBeenCalled();
  });

  it("only overrides DNS and keeps HTTPS hostname validation, cancellation and credentials", async () => {
    vi.stubEnv("SERVER_API_CONNECT_ADDRESS", "192.0.2.10");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.test/v1");
    const request = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal("fetch", request);
    const { fetchServerApi } = await import("./server-api-transport");
    const signal = new AbortController().signal;
    const options = { signal, headers: { Cookie: "private-session" }, cache: "no-store" as const };
    await fetchServerApi("https://api.test/v1/me/page-bootstrap/profile", options);
    await fetchServerApi("https://api.test/v1/health", {});
    expect(pools).toHaveLength(1);
    expect(pools[0].origin).toBe("https://api.test");
    expect(pools[0].options.connect).not.toHaveProperty("rejectUnauthorized");
    expect(pools[0].options.connect).not.toHaveProperty("servername");
    expect(request.mock.calls[0]).toEqual(["https://api.test/v1/me/page-bootstrap/profile", {
      ...options, dispatcher: pools[0], redirect: "error",
    }]);
    const callback = vi.fn();
    pools[0].options.connect.lookup("api.test", { all: true }, callback);
    expect(callback).toHaveBeenLastCalledWith(null, [{ address: "192.0.2.10", family: 4 }]);
    pools[0].options.connect.lookup("other.test", {}, callback);
    expect(callback.mock.lastCall?.[0]).toBeInstanceOf(Error);
  });
});

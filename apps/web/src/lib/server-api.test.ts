import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "private-session" }) }),
}));
vi.mock("./api-base-url", () => ({ getServerApiBaseUrl: async () => "http://api.test" }));

import { fetchUserApiServer, ServerApiError } from "./server-api";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("server API diagnostics", () => {
  it("keeps optional empty responses and disables tracing by default", async () => {
    vi.stubEnv("SERVER_API_TIMING_LOG_ENABLED", "false");
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", request);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await fetchUserApiServer("/me/questionnaire")).toBeNull();
    expect(request.mock.calls[0][1].headers).not.toHaveProperty("x-lilink-trace-id");
    expect(log).not.toHaveBeenCalled();
  });

  it("correlates requests without logging cookies, queries or response data", async () => {
    vi.stubEnv("SERVER_API_TIMING_LOG_ENABLED", "true");
    const request = vi.fn().mockResolvedValue(Response.json({ privateAnswer: "private-answer" }));
    vi.stubGlobal("fetch", request);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(await fetchUserApiServer("/me/questionnaire?private=query")).toEqual({ privateAnswer: "private-answer" });
    const diagnostic = JSON.parse(log.mock.calls[0][0]);
    expect(diagnostic.traceId).toBe(request.mock.calls[0][1].headers["x-lilink-trace-id"]);
    expect(diagnostic.path).toBe("/me/questionnaire");
    expect(diagnostic.totalMs).toBeGreaterThanOrEqual(0);
    expect(log.mock.calls[0][0]).not.toMatch(/private|Cookie|Answer/);
  });

  it("preserves the 429 status and response message", async () => {
    const request = vi.fn().mockResolvedValue(Response.json({ message: "Try later" }, { status: 429 }));
    vi.stubGlobal("fetch", request);
    await expect(fetchUserApiServer("/me/bootstrap")).rejects.toEqual(new ServerApiError("Try later", 429));
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("recovers a read after a transient gateway failure", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response("Gateway failure", { status: 520 }))
      .mockResolvedValueOnce(Response.json({ recovered: true }));
    vi.stubGlobal("fetch", request);
    expect(await fetchUserApiServer("/me/bootstrap")).toEqual({ recovered: true });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("retries connection failures once and reports service unavailability", async () => {
    const request = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", request);
    await expect(fetchUserApiServer("/me/bootstrap")).rejects.toMatchObject({ status: 503 });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("bounds stalled response bodies as well as the connection", async () => {
    vi.useFakeTimers();
    const request = vi.fn((_url, init: RequestInit) => Promise.resolve({
      status: 200,
      text: () => new Promise((_resolve, reject) => {
        init.signal!.addEventListener("abort", () => reject(new Error("body stalled")), { once: true });
      }),
    }));
    vi.stubGlobal("fetch", request);
    const result = expect(fetchUserApiServer("/me/bootstrap")).rejects.toMatchObject({ status: 504 });
    await vi.advanceTimersByTimeAsync(8_000);
    await result;
    expect(request).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not replay writes after gateway failures", async () => {
    const request = vi.fn().mockResolvedValue(new Response("Gateway failure", { status: 520 }));
    vi.stubGlobal("fetch", request);
    await expect(fetchUserApiServer("/me/example", { method: "POST", body: "{}" })).rejects.toMatchObject({ status: 520 });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("preserves caller cancellation without retrying", async () => {
    const controller = new AbortController();
    controller.abort();
    const reason = new DOMException("Cancelled", "AbortError");
    const request = vi.fn().mockRejectedValue(reason);
    vi.stubGlobal("fetch", request);
    await expect(fetchUserApiServer("/me/bootstrap", { signal: controller.signal })).rejects.toBe(reason);
    expect(request).toHaveBeenCalledTimes(1);
  });
});

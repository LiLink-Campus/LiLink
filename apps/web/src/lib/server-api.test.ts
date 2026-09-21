import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "private-session" }) }),
}));
vi.mock("./api-base-url", () => ({ getServerApiBaseUrl: async () => "http://api.test" }));

import { fetchUserApiServer, ServerApiError } from "./server-api";

afterEach(() => {
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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "Try later" }, { status: 429 })));
    await expect(fetchUserApiServer("/me/bootstrap")).rejects.toEqual(new ServerApiError("Try later", 429));
  });
});

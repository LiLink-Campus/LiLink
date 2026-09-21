import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/server-api", () => ({
  fetchUserApiServer: vi.fn(),
  ServerApiError: class extends Error { constructor(message: string, public status: number) { super(message); } },
}));
import { fetchUserApiServer, ServerApiError } from "../../../lib/server-api";
import { PUT } from "./route";

const upstream = vi.mocked(fetchUserApiServer);
const request = (origin = "https://site.test", body = JSON.stringify({ versionId: "current", answers: { looks: "4" } })) => new Request("https://site.test/api/questionnaire", { method: "PUT", headers: { origin }, body });
beforeEach(() => vi.resetAllMocks());

describe("questionnaire save fallback", () => {
  it("forwards a same-origin write once with the existing server session and disables caching", async () => {
    upstream.mockResolvedValue({ saveState: "DRAFT" });
    const result = await PUT(request());
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(await result.json()).toEqual({ saveState: "DRAFT" });
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream).toHaveBeenCalledWith("/me/questionnaire", expect.objectContaining({ method: "PUT", body: expect.stringContaining('"versionId":"current"') }));
  });
  it("rejects cross-origin and missing-origin requests before forwarding", async () => {
    expect((await PUT(request("https://foreign.test"))).status).toBe(403);
    expect((await PUT(new Request("https://site.test/api/questionnaire", { method: "PUT" }))).status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("checks the public host when Next uses an internal server URL", async () => {
    upstream.mockResolvedValue({ saveState: "DRAFT" });
    const input = new Request("http://localhost:3000/api/questionnaire", {
      method: "PUT", headers: { host: "site.test", "x-forwarded-proto": "https", origin: "https://site.test" }, body: "{}",
    });
    expect((await PUT(input)).status).toBe(200);
  });
  it("preserves authentication and validation errors without retrying them", async () => {
    for (const status of [401, 400, 429]) {
      upstream.mockRejectedValue(new ServerApiError("Rejected", status));
      const result = await PUT(request());
      expect(result.status).toBe(status);
      expect(await result.json()).toEqual({ message: "Rejected" });
    }
    expect(upstream).toHaveBeenCalledTimes(3);
  });
  it("does not send oversized data upstream", async () => {
    expect((await PUT(request("https://site.test", "x".repeat(100_001)))).status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
  });
});

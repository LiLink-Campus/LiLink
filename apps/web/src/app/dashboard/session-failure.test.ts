import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/server-api", () => ({
  fetchUserApiServer: vi.fn(),
  hasUserSessionCookie: vi.fn(async () => true),
  ServerApiError: class extends Error {
    constructor(message: string, readonly status: number) { super(message); }
  },
}));
vi.mock("./me/user-center", () => ({ UserCenter: () => null }));
vi.mock("./vip/vip-client", () => ({ VipClient: () => null }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("login redirect"); }) }));

import { fetchUserApiServer, ServerApiError } from "../../lib/server-api";
import { redirect } from "next/navigation";
import DashboardMePage from "./me/page";
import VipPage from "./vip/page";

afterEach(() => vi.clearAllMocks());

describe.each([
  ["user center", DashboardMePage],
  ["VIP", VipPage],
] as const)("%s session failures", (_name, renderPage) => {
  it.each([429, 503, 504])("keeps a %i failure in the dashboard error boundary", async (status) => {
    const error = new ServerApiError("Try later", status);
    vi.mocked(fetchUserApiServer).mockImplementation(async path => {
      if (path === "/auth/me" || path === "/me/page-bootstrap/center") throw error;
      return null as never;
    });
    await expect(renderPage()).rejects.toBe(error);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects an expired session to login", async () => {
    vi.mocked(fetchUserApiServer).mockImplementation(async path => {
      if (path === "/auth/me" || path === "/me/page-bootstrap/center") throw new ServerApiError("Expired", 401);
      return null as never;
    });
    await expect(renderPage()).rejects.toThrow("login redirect");
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});

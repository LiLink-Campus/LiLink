import { afterEach, expect, it, vi } from "vitest";

const requestHeaders = vi.hoisted(() => vi.fn(async () => new Headers({ host: "192.168.1.20:3000" })));
vi.mock("next/headers", () => ({ headers: requestHeaders }));
import { getServerApiBaseUrl } from "./api-base-url";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it("keeps production public pages cacheable without reading request headers", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.test/v1");
  expect(await getServerApiBaseUrl()).toBe("https://api.example.test/v1");
  expect(requestHeaders).not.toHaveBeenCalled();
});

it("still resolves the request's LAN host during local development", async () => {
  vi.stubEnv("NODE_ENV", "development");
  expect(await getServerApiBaseUrl()).toBe("http://192.168.1.20:4000/v1");
  expect(requestHeaders).toHaveBeenCalledOnce();
});

it("does not fall back to a request host when production configuration is missing", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
  await expect(getServerApiBaseUrl()).rejects.toThrow("required");
  expect(requestHeaders).not.toHaveBeenCalled();
});

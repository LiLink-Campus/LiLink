import { afterEach, expect, it, vi } from "vitest";
import { hasSeenReveal, markRevealSeen } from "./reveal-receipt";
afterEach(() => vi.unstubAllGlobals());
it("persists the receipt and isolates users and rounds", () => {
  const records = new Map<string, string>();
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => records.get(key), setItem: (key: string, value: string) => records.set(key, value) } });
  expect(hasSeenReveal("test-user:round-one")).toBe(false);
  markRevealSeen("test-user:round-one");
  expect(records.get("lilink:match-reveal:v1:test-user:round-one")).toBe("seen");
  expect(hasSeenReveal("test-user:round-one")).toBe(true);
  expect(hasSeenReveal("other-user:round-one")).toBe(false);
  expect(hasSeenReveal("test-user:round-two")).toBe(false);
});
it("does not block the result if browser storage is unavailable", () => {
  vi.stubGlobal("window", { get localStorage() { throw new Error("blocked"); } });
  expect(hasSeenReveal("blocked:round")).toBe(false);
  expect(() => markRevealSeen("blocked:round")).not.toThrow();
  expect(hasSeenReveal("blocked:round")).toBe(true);
});

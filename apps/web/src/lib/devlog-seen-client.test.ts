import { describe, expect, it } from "vitest";
import { hasUnseenDevlogUpdates } from "./devlog-seen-client";

describe("hasUnseenDevlogUpdates", () => {
  it("is false when there is no latest published date", () => {
    expect(hasUnseenDevlogUpdates(null, null)).toBe(false);
    expect(hasUnseenDevlogUpdates(null, "2026-01-01")).toBe(false);
  });

  it("is true on first visit (no lastSeen) when updates exist", () => {
    expect(hasUnseenDevlogUpdates("2026-05-27", null)).toBe(true);
  });

  it("is true when the latest date is newer than lastSeen", () => {
    expect(hasUnseenDevlogUpdates("2026-05-28", "2026-05-27")).toBe(true);
  });

  it("is false once the latest date has been seen (equal or older)", () => {
    expect(hasUnseenDevlogUpdates("2026-05-27", "2026-05-27")).toBe(false);
    expect(hasUnseenDevlogUpdates("2026-05-27", "2026-05-28")).toBe(false);
  });
});

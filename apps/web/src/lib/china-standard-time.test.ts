import { describe, expect, it } from "vitest";

import { formatChinaStandardDateTime } from "./china-standard-time";

describe("formatChinaStandardDateTime", () => {
  it("formats instants in China Standard Time", () => {
    expect(formatChinaStandardDateTime("2026-06-09T18:00:00.000Z")).toBe(
      "2026/6/10 02:00",
    );
  });

  it("returns invalid input unchanged", () => {
    expect(formatChinaStandardDateTime("not-a-date")).toBe("not-a-date");
  });
});

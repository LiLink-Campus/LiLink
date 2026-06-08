import { describe, expect, it } from "vitest";
import { findMatchingSchool } from "./eligible-schools";

describe("findMatchingSchool", () => {
  it("does not treat a bare top-level domain as an eligible school domain", () => {
    const schools = [
      {
        id: "school-cn",
        name: "Invalid TLD School",
        description: null,
        domains: ["cn"],
      },
    ];

    expect(findMatchingSchool(schools, "attacker@evil.cn")).toBeNull();
  });
});

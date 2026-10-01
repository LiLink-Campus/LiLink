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


describe("registration email recognition", () => {
  const schools = [{ id: "school", name: "Preview School", description: null, domains: ["bupt.edu.cn"] }];
  it.each(["@bupt.edu.cn", "user@@bupt.edu.cn", "user name@bupt.edu.cn", "user@notbupt.edu.cn"])("does not claim eligibility for %s", email => {
    expect(findMatchingSchool(schools, email)).toBeNull();
  });
  it("recognizes complete school addresses", () => {
    expect(findMatchingSchool(schools, "student@bupt.edu.cn")?.school.id).toBe("school");
  });
});

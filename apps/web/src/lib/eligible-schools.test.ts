import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchEligibleSchools, findMatchingSchool } from "./eligible-schools";

afterEach(() => vi.unstubAllGlobals());

describe("fetchEligibleSchools", () => {
  it("uses the shared public cache and supports cancellation", async () => {
    const payload = {
      schools: [],
      totalSchoolCount: 0,
      totalDomainCount: 0,
      generatedAt: "2026-09-12T00:00:00Z",
    };
    const fetchMock = vi.fn().mockResolvedValue(Response.json(payload));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await expect(fetchEligibleSchools({ signal: controller.signal })).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/public/schools",
      expect.objectContaining({ cache: "default", signal: controller.signal })
    );
  });

  it("rejects backend failures rather than supplying a fallback school list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(fetchEligibleSchools()).rejects.toThrow("503");
  });
});

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
  const schools = [
    { id: "school", name: "Preview School", description: null, domains: ["bupt.edu.cn"] },
  ];
  it.each(["@bupt.edu.cn", "user@@bupt.edu.cn", "user name@bupt.edu.cn", "user@notbupt.edu.cn"])(
    "does not claim eligibility for %s",
    (email) => {
      expect(findMatchingSchool(schools, email)).toBeNull();
    }
  );
  it("recognizes complete school addresses", () => {
    expect(findMatchingSchool(schools, "student@bupt.edu.cn")?.school.id).toBe("school");
  });
});

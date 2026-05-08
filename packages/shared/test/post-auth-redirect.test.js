const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveSafePostAuthRedirect } = require("../dist");

const ORIGIN = "https://app.example.com";
const DEFAULT = "/dashboard";

test("accepts same-origin absolute path", () => {
  assert.equal(
    resolveSafePostAuthRedirect("/matches/foo", ORIGIN, DEFAULT),
    "/matches/foo",
  );
});

test("accepts path with query and hash on same origin", () => {
  assert.equal(
    resolveSafePostAuthRedirect("/a?x=1#h", ORIGIN, DEFAULT),
    "/a?x=1#h",
  );
});

test("rejects protocol-relative URL (open redirect)", () => {
  assert.equal(
    resolveSafePostAuthRedirect("//evil.example/phish", ORIGIN, DEFAULT),
    DEFAULT,
  );
});

test("rejects triple-slash host form", () => {
  assert.equal(
    resolveSafePostAuthRedirect("///evil.example/", ORIGIN, DEFAULT),
    DEFAULT,
  );
});

test("rejects absolute off-origin https URL", () => {
  assert.equal(
    resolveSafePostAuthRedirect("https://evil.example/x", ORIGIN, DEFAULT),
    DEFAULT,
  );
});

test("rejects backslash host confusion", () => {
  assert.equal(
    resolveSafePostAuthRedirect("/\\\\evil.example/", ORIGIN, DEFAULT),
    DEFAULT,
  );
});

test("rejects javascript: and other non-http(s) schemes", () => {
  assert.equal(
    resolveSafePostAuthRedirect("javascript:void(0)", ORIGIN, DEFAULT),
    DEFAULT,
  );
});

test("returns default for null, empty, or whitespace", () => {
  assert.equal(resolveSafePostAuthRedirect(null, ORIGIN, DEFAULT), DEFAULT);
  assert.equal(resolveSafePostAuthRedirect("", ORIGIN, DEFAULT), DEFAULT);
  assert.equal(resolveSafePostAuthRedirect("   ", ORIGIN, DEFAULT), DEFAULT);
});

test("returns default when page origin is invalid", () => {
  assert.equal(
    resolveSafePostAuthRedirect("/ok", "not-a-url", DEFAULT),
    DEFAULT,
  );
});

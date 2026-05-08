const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseSafeInternalPath,
  parseSafeAdminPostLoginPath,
} = require("../dist");

test("parseSafeInternalPath accepts same-origin root-relative paths", () => {
  assert.equal(parseSafeInternalPath("/dashboard"), "/dashboard");
  assert.equal(parseSafeInternalPath("/dashboard/match"), "/dashboard/match");
  assert.equal(parseSafeInternalPath("/path?x=1#h"), "/path?x=1#h");
});

test("parseSafeInternalPath rejects protocol-relative and absolute URLs", () => {
  assert.equal(parseSafeInternalPath("//evil.example/phish"), null);
  assert.equal(parseSafeInternalPath("///evil.example/"), null);
  assert.equal(parseSafeInternalPath("https://evil.example/"), null);
  assert.equal(parseSafeInternalPath("http://evil.example/"), null);
});

test("parseSafeInternalPath rejects non-path values", () => {
  assert.equal(parseSafeInternalPath(null), null);
  assert.equal(parseSafeInternalPath(""), null);
  assert.equal(parseSafeInternalPath("dashboard"), null);
  assert.equal(parseSafeInternalPath("javascript:alert(1)"), null);
});

test("parseSafeInternalPath rejects backslash and control characters", () => {
  assert.equal(parseSafeInternalPath("/\\evil.example"), null);
  assert.equal(parseSafeInternalPath("/path\n/inject"), null);
});

test("parseSafeAdminPostLoginPath only allows /admin routes", () => {
  assert.equal(parseSafeAdminPostLoginPath("/admin"), "/admin");
  assert.equal(parseSafeAdminPostLoginPath("/admin/users"), "/admin/users");
  assert.equal(parseSafeAdminPostLoginPath("//evil.example/admin/users"), null);
  assert.equal(parseSafeAdminPostLoginPath("/dashboard"), null);
  assert.equal(parseSafeAdminPostLoginPath("/administrators"), null);
});

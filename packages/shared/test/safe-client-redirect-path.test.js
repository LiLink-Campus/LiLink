const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isSafeSameOriginRelativePathForBrowserLocation,
} = require("../dist");

test("accepts normal same-site paths", () => {
  assert.equal(isSafeSameOriginRelativePathForBrowserLocation("/dashboard"), true);
  assert.equal(
    isSafeSameOriginRelativePathForBrowserLocation("/dashboard/match"),
    true,
  );
});

test("rejects scheme-relative URLs that start with a slash", () => {
  assert.equal(
    isSafeSameOriginRelativePathForBrowserLocation("//evil.example/phish"),
    false,
  );
  assert.equal(
    isSafeSameOriginRelativePathForBrowserLocation("///evil.example/"),
    false,
  );
});

test("rejects non-path values", () => {
  assert.equal(
    isSafeSameOriginRelativePathForBrowserLocation("https://evil.example/"),
    false,
  );
  assert.equal(isSafeSameOriginRelativePathForBrowserLocation("dashboard"), false);
  assert.equal(isSafeSameOriginRelativePathForBrowserLocation(""), false);
});

test("rejects paths containing backslashes", () => {
  assert.equal(
    isSafeSameOriginRelativePathForBrowserLocation("/x\\y"),
    false,
  );
});

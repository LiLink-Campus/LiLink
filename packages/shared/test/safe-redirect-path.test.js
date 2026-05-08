const test = require("node:test");
const assert = require("node:assert/strict");

const { sanitizeSameOriginRelativePath } = require("../dist");

const ORIGIN = "https://app.example";

test("sanitizeSameOriginRelativePath accepts normal same-origin paths", () => {
  assert.equal(
    sanitizeSameOriginRelativePath("/dashboard", ORIGIN),
    "/dashboard",
  );
  assert.equal(
    sanitizeSameOriginRelativePath("/dash?q=1#h", ORIGIN),
    "/dash?q=1#h",
  );
});

test("sanitizeSameOriginRelativePath rejects protocol-relative URLs", () => {
  assert.equal(sanitizeSameOriginRelativePath("//evil.test/phish", ORIGIN), null);
  assert.equal(sanitizeSameOriginRelativePath("///evil.test/phish", ORIGIN), null);
});

test("sanitizeSameOriginRelativePath rejects absolute URLs on other origins", () => {
  assert.equal(
    sanitizeSameOriginRelativePath("https://evil.test/x", ORIGIN),
    null,
  );
});

test("sanitizeSameOriginRelativePath accepts absolute URL when origin matches", () => {
  assert.equal(
    sanitizeSameOriginRelativePath(
      "https://app.example/deep/link",
      ORIGIN,
    ),
    "/deep/link",
  );
});

test("sanitizeSameOriginRelativePath rejects paths that normalize to a scheme-relative pathname", () => {
  assert.equal(
    sanitizeSameOriginRelativePath("/dashboard/../../\\evil.test", ORIGIN),
    null,
  );
});

test("sanitizeSameOriginRelativePath rejects control characters", () => {
  assert.equal(sanitizeSameOriginRelativePath("/dash\n", ORIGIN), null);
});

test("sanitizeSameOriginRelativePath returns null for empty input", () => {
  assert.equal(sanitizeSameOriginRelativePath("", ORIGIN), null);
  assert.equal(sanitizeSameOriginRelativePath(null, ORIGIN), null);
});

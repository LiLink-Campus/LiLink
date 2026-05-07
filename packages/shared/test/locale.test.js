const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  isSupportedLocale,
  normalizeLocale,
  parseSupportedLocale,
} = require("../dist");

test("SUPPORTED_LOCALES and DEFAULT_LOCALE stay aligned with product expectations", () => {
  assert.deepEqual([...SUPPORTED_LOCALES], ["zh-CN", "en-US"]);
  assert.equal(DEFAULT_LOCALE, "zh-CN");
  assert.equal(LOCALE_COOKIE_NAME, "lilink_locale");
});

test("isSupportedLocale accepts only canonical supported codes", () => {
  assert.equal(isSupportedLocale("zh-CN"), true);
  assert.equal(isSupportedLocale("en-US"), true);
  assert.equal(isSupportedLocale("en-us"), false);
  assert.equal(isSupportedLocale("fr-FR"), false);
  assert.equal(isSupportedLocale(""), false);
  assert.equal(isSupportedLocale(null), false);
  assert.equal(isSupportedLocale(1), false);
});

test("parseSupportedLocale maps BCP 47 aliases to supported locales", () => {
  assert.equal(parseSupportedLocale("en-us"), "en-US");
  assert.equal(parseSupportedLocale("ZH-cn"), "zh-CN");
});

test("parseSupportedLocale returns null for unknown or invalid input", () => {
  assert.equal(parseSupportedLocale("fr-CA"), null);
  assert.equal(parseSupportedLocale(""), null);
  assert.equal(parseSupportedLocale("not-a-locale"), null);
  assert.equal(parseSupportedLocale(null), null);
});

test("normalizeLocale falls back to DEFAULT_LOCALE when parsing fails", () => {
  assert.equal(normalizeLocale(undefined), DEFAULT_LOCALE);
  assert.equal(normalizeLocale("xx-YY"), DEFAULT_LOCALE);
});

test("normalizeLocale returns a supported locale when parsing succeeds", () => {
  assert.equal(normalizeLocale("EN-us"), "en-US");
});

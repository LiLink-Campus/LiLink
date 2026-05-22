const test = require("node:test");
const assert = require("node:assert/strict");

const {
  WEEKLY_INTENTS,
  WEEKLY_INTENT_LABELS,
  isWeeklyIntent,
  areWeeklyIntentsCompatible,
} = require("../dist");

test("WEEKLY_INTENTS exposes the canonical three values", () => {
  assert.deepEqual([...WEEKLY_INTENTS], ["FRIEND", "DATE", "BOTH"]);
});

test("WEEKLY_INTENT_LABELS provides primary + subtitle for every intent", () => {
  for (const intent of WEEKLY_INTENTS) {
    const meta = WEEKLY_INTENT_LABELS[intent];
    assert.ok(meta, `missing label for ${intent}`);
    assert.equal(typeof meta.primary, "string");
    assert.equal(typeof meta.subtitle, "string");
    assert.ok(meta.description.length > 0);
  }
});

test("isWeeklyIntent narrows valid strings only", () => {
  assert.equal(isWeeklyIntent("FRIEND"), true);
  assert.equal(isWeeklyIntent("DATE"), true);
  assert.equal(isWeeklyIntent("BOTH"), true);
  assert.equal(isWeeklyIntent("friend"), false);
  assert.equal(isWeeklyIntent(""), false);
  assert.equal(isWeeklyIntent(null), false);
  assert.equal(isWeeklyIntent(undefined), false);
  assert.equal(isWeeklyIntent(123), false);
});

test("areWeeklyIntentsCompatible enforces the BOTH-bridges-all rule", () => {
  // Same-intent always compatible
  for (const intent of WEEKLY_INTENTS) {
    assert.equal(
      areWeeklyIntentsCompatible(intent, intent),
      true,
      `${intent} ↔ ${intent} should be compatible`,
    );
  }

  // BOTH bridges everything in both directions
  assert.equal(areWeeklyIntentsCompatible("BOTH", "FRIEND"), true);
  assert.equal(areWeeklyIntentsCompatible("FRIEND", "BOTH"), true);
  assert.equal(areWeeklyIntentsCompatible("BOTH", "DATE"), true);
  assert.equal(areWeeklyIntentsCompatible("DATE", "BOTH"), true);

  // FRIEND × DATE is hard-blocked
  assert.equal(areWeeklyIntentsCompatible("FRIEND", "DATE"), false);
  assert.equal(areWeeklyIntentsCompatible("DATE", "FRIEND"), false);
});

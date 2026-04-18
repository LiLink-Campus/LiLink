const test = require("node:test");
const assert = require("node:assert/strict");

const { takeNextAutosaveQueueItem } = require("../dist");

test("takeNextAutosaveQueueItem returns null when nothing is queued", () => {
  assert.equal(
    takeNextAutosaveQueueItem(null, {
      isUnmounted: false,
      lastSavedSnapshot: "saved-1",
    }),
    null,
  );
});

test("takeNextAutosaveQueueItem drops queued saves after unmount", () => {
  assert.equal(
    takeNextAutosaveQueueItem(
      {
        payload: { field: "value" },
        snapshot: "queued-1",
      },
      {
        isUnmounted: true,
        lastSavedSnapshot: "saved-1",
      },
    ),
    null,
  );
});

test("takeNextAutosaveQueueItem drops queued saves that are already persisted", () => {
  assert.equal(
    takeNextAutosaveQueueItem(
      {
        payload: { field: "value" },
        snapshot: "saved-1",
      },
      {
        isUnmounted: false,
        lastSavedSnapshot: "saved-1",
      },
    ),
    null,
  );
});

test("takeNextAutosaveQueueItem keeps the latest queued save available for retry", () => {
  const queuedSave = {
    payload: { field: "new-value" },
    snapshot: "queued-2",
  };

  assert.deepEqual(
    takeNextAutosaveQueueItem(queuedSave, {
      isUnmounted: false,
      lastSavedSnapshot: "saved-1",
    }),
    queuedSave,
  );
});

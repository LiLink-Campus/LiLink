const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createAutosaveTimeoutController,
  takeNextAutosaveQueueItem,
} = require("../dist");

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

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

test("createAutosaveTimeoutController aborts after the timeout", async () => {
  const autosaveTimeout = createAutosaveTimeoutController(10);

  await wait(20);

  assert.equal(autosaveTimeout.signal.aborted, true);
  assert.equal(autosaveTimeout.hasTimedOut(), true);
});

test("createAutosaveTimeoutController clear prevents stale timeout aborts", async () => {
  const autosaveTimeout = createAutosaveTimeoutController(10);

  autosaveTimeout.clear();
  await wait(20);

  assert.equal(autosaveTimeout.signal.aborted, false);
  assert.equal(autosaveTimeout.hasTimedOut(), false);
});

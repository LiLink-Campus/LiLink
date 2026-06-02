import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEVLOG_LAST_SEEN_KEY,
  DEVLOG_LAST_SEEN_UPDATED_EVENT,
} from "./devlog-constants";
import {
  hasUnseenDevlogUpdates,
  readDevlogLastSeen,
  writeDevlogLastSeen,
} from "./devlog-seen-client";

describe("hasUnseenDevlogUpdates", () => {
  it("is false when there is no latest published date", () => {
    expect(hasUnseenDevlogUpdates(null, null)).toBe(false);
    expect(hasUnseenDevlogUpdates(null, "2026-01-01")).toBe(false);
  });

  it("is true on first visit (no lastSeen) when updates exist", () => {
    expect(hasUnseenDevlogUpdates("2026-05-27", null)).toBe(true);
  });

  it("is true when the latest date is newer than lastSeen", () => {
    expect(hasUnseenDevlogUpdates("2026-05-28", "2026-05-27")).toBe(true);
  });

  it("is false once the latest date has been seen (equal or older)", () => {
    expect(hasUnseenDevlogUpdates("2026-05-27", "2026-05-27")).toBe(false);
    expect(hasUnseenDevlogUpdates("2026-05-27", "2026-05-28")).toBe(false);
  });
});

// The functions below touch `window`, which does not exist in the node test
// environment. We stub a minimal `window` (and `CustomEvent`) per case instead
// of switching to jsdom, since these are the only DOM globals they rely on.
describe("readDevlogLastSeen / writeDevlogLastSeen", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("writes the value, dispatches the update event, and reads it back", () => {
    const store: Record<string, string> = {};
    const getItem = vi.fn((key: string) =>
      Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
    );
    const setItem = vi.fn((key: string, value: string) => {
      store[key] = value;
    });
    const dispatchEvent = vi.fn();

    // Stub CustomEvent so the assertion does not depend on the Node version
    // exposing a global CustomEvent constructor.
    class FakeCustomEvent {
      readonly type: string;
      constructor(type: string) {
        this.type = type;
      }
    }
    vi.stubGlobal("CustomEvent", FakeCustomEvent);
    vi.stubGlobal("window", {
      localStorage: { getItem, setItem },
      dispatchEvent,
    });

    writeDevlogLastSeen("2026-05-27");

    expect(setItem).toHaveBeenCalledWith(DEVLOG_LAST_SEEN_KEY, "2026-05-27");
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const dispatched = dispatchEvent.mock.calls[0]?.[0] as FakeCustomEvent;
    expect(dispatched.type).toBe(DEVLOG_LAST_SEEN_UPDATED_EVENT);

    expect(readDevlogLastSeen()).toBe("2026-05-27");
  });

  it("returns null when reading from storage throws", () => {
    const getItem = vi.fn(() => {
      throw new Error("storage unavailable");
    });
    vi.stubGlobal("window", {
      localStorage: { getItem, setItem: vi.fn() },
      dispatchEvent: vi.fn(),
    });

    expect(() => readDevlogLastSeen()).not.toThrow();
    expect(readDevlogLastSeen()).toBeNull();
  });

  it("swallows storage failures when writing (private mode / quota)", () => {
    const setItem = vi.fn(() => {
      throw new Error("quota exceeded");
    });
    const dispatchEvent = vi.fn();
    vi.stubGlobal("CustomEvent", class {});
    vi.stubGlobal("window", {
      localStorage: { getItem: vi.fn(), setItem },
      dispatchEvent,
    });

    expect(() => writeDevlogLastSeen("2026-05-27")).not.toThrow();
    // The throw happens before the event dispatch, so nothing is emitted.
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});

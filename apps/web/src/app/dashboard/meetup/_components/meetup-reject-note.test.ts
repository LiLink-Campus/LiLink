import { describe, expect, it } from "vitest";
import type { MeetupMessage } from "../../../../lib/api";
import { deriveCounterpartRejectNote } from "./meetup-reject-note";

const ME = "user-me";
const THEM = "user-them";

function message(overrides: Partial<MeetupMessage> & { createdAt: string }): MeetupMessage {
  return {
    id: `msg-${overrides.createdAt}`,
    actorUserId: THEM,
    type: "PROPOSE",
    notePreset: null,
    noteText: null,
    proposal: null,
    ...overrides,
  };
}

describe("deriveCounterpartRejectNote", () => {
  it("returns the counterpart's note text when their latest message is a REJECT", () => {
    const session = {
      messages: [
        message({ actorUserId: ME, type: "PROPOSE", createdAt: "2026-01-01T00:00:00Z" }),
        message({
          actorUserId: THEM,
          type: "REJECT",
          noteText: "时间都不合适，换个周末吧",
          createdAt: "2026-01-01T01:00:00Z",
        }),
      ],
    };
    expect(deriveCounterpartRejectNote(session, ME)).toBe("时间都不合适，换个周末吧");
  });

  it("falls back to the preset when the REJECT has no free-text note", () => {
    const session = {
      messages: [
        message({
          actorUserId: THEM,
          type: "REJECT",
          noteText: null,
          notePreset: "时间不合适",
          createdAt: "2026-01-01T01:00:00Z",
        }),
      ],
    };
    expect(deriveCounterpartRejectNote(session, ME)).toBe("时间不合适");
  });

  it("returns null when the REJECT carries neither note text nor preset", () => {
    const session = {
      messages: [
        message({ actorUserId: THEM, type: "REJECT", createdAt: "2026-01-01T01:00:00Z" }),
      ],
    };
    expect(deriveCounterpartRejectNote(session, ME)).toBeNull();
  });

  it("does NOT resurface a stale REJECT once the counterpart sends a later message (issue #88)", () => {
    const session = {
      messages: [
        message({
          actorUserId: THEM,
          type: "REJECT",
          noteText: "这次不行",
          createdAt: "2026-01-01T01:00:00Z",
        }),
        // A later partial-accept / fresh proposal from the same counterpart.
        message({ actorUserId: THEM, type: "PROPOSE", createdAt: "2026-01-01T02:00:00Z" }),
      ],
    };
    expect(deriveCounterpartRejectNote(session, ME)).toBeNull();
  });

  it("ignores the current user's own later messages when finding the counterpart's latest", () => {
    const session = {
      messages: [
        message({
          actorUserId: THEM,
          type: "REJECT",
          noteText: "再想想",
          createdAt: "2026-01-01T01:00:00Z",
        }),
        // My own later message must not hide the counterpart's REJECT note.
        message({ actorUserId: ME, type: "PROPOSE", createdAt: "2026-01-01T03:00:00Z" }),
      ],
    };
    expect(deriveCounterpartRejectNote(session, ME)).toBe("再想想");
  });

  it("picks the chronologically latest counterpart message regardless of array order", () => {
    const session = {
      messages: [
        message({ actorUserId: THEM, type: "PROPOSE", createdAt: "2026-01-01T05:00:00Z" }),
        message({
          actorUserId: THEM,
          type: "REJECT",
          noteText: "stale",
          createdAt: "2026-01-01T01:00:00Z",
        }),
      ],
    };
    // The PROPOSE at 05:00 is the latest counterpart message, so no note.
    expect(deriveCounterpartRejectNote(session, ME)).toBeNull();
  });

  it("returns null when the counterpart has sent no messages", () => {
    const session = {
      messages: [
        message({ actorUserId: ME, type: "PROPOSE", createdAt: "2026-01-01T00:00:00Z" }),
      ],
    };
    expect(deriveCounterpartRejectNote(session, ME)).toBeNull();
  });

  it("returns null for an empty session", () => {
    expect(deriveCounterpartRejectNote({ messages: [] }, ME)).toBeNull();
  });
});

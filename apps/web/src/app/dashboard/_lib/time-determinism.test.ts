import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveAgenda, type AgendaInputs } from "./agenda";
import { canEditCurrentCycleParticipation } from "./format";
import { describeDaysUntilLabel, describeRelativeUntil } from "./focus";
import type {
  ContactPreferencesPayload,
  DashboardCurrentCycle,
  DashboardPayload,
} from "./types";

// Regression guard for the /dashboard hydration mismatch (issue #75): the
// render path must derive time-dependent UI from an injected `nowMs`, never
// from a live `Date.now()`. Each case freezes `nowMs` and then moves the real
// clock far away to prove the output ignores wall-clock time.
const DEADLINE_ISO = "2030-06-01T00:00:00.000Z";
const DEADLINE_MS = Date.parse(DEADLINE_ISO);
const FAR_FUTURE_MS = DEADLINE_MS + 30 * 24 * 60 * 60 * 1000;

function makeCycle(
  overrides: Partial<DashboardCurrentCycle> = {},
): DashboardCurrentCycle {
  return {
    id: "cycle-1",
    codename: "测试轮",
    revealAt: DEADLINE_ISO,
    participationDeadline: DEADLINE_ISO,
    status: "OPEN",
    participationStatus: "OPTED_OUT",
    intent: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("canEditCurrentCycleParticipation", () => {
  it("is editable strictly before the deadline", () => {
    const cycle = makeCycle();
    expect(canEditCurrentCycleParticipation(cycle, DEADLINE_MS - 1)).toBe(true);
  });

  it("is locked at and after the deadline", () => {
    const cycle = makeCycle();
    expect(canEditCurrentCycleParticipation(cycle, DEADLINE_MS)).toBe(false);
    expect(canEditCurrentCycleParticipation(cycle, DEADLINE_MS + 1)).toBe(false);
  });

  it("ignores the real clock and trusts the injected nowMs", () => {
    const cycle = makeCycle();
    // Wall clock is long past the deadline, but the frozen nowMs is before it.
    vi.spyOn(Date, "now").mockReturnValue(FAR_FUTURE_MS);
    expect(canEditCurrentCycleParticipation(cycle, DEADLINE_MS - 60_000)).toBe(
      true,
    );
  });
});

describe("describeRelativeUntil", () => {
  it("formats the gap between target and nowMs", () => {
    const nowMs = DEADLINE_MS - (2 * 60 * 60 * 1000 + 5 * 60 * 1000);
    expect(describeRelativeUntil(DEADLINE_ISO, nowMs)).toBe("还有 2 小时");
  });

  it("reports already-open once nowMs reaches the target", () => {
    expect(describeRelativeUntil(DEADLINE_ISO, DEADLINE_MS)).toBe("已开启");
  });

  it("ignores the real clock and trusts the injected nowMs", () => {
    const nowMs = DEADLINE_MS - 3 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(FAR_FUTURE_MS);
    expect(describeRelativeUntil(DEADLINE_ISO, nowMs)).toBe("还有 3 分钟");
  });
});

describe("describeDaysUntilLabel", () => {
  it("counts whole days from nowMs", () => {
    const nowMs = DEADLINE_MS - (3 * 24 + 5) * 60 * 60 * 1000;
    expect(describeDaysUntilLabel(DEADLINE_ISO, nowMs)).toBe("D-3");
  });

  it("ignores the real clock and trusts the injected nowMs", () => {
    const nowMs = DEADLINE_MS - 2 * 24 * 60 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(FAR_FUTURE_MS);
    expect(describeDaysUntilLabel(DEADLINE_ISO, nowMs)).toBe("D-2");
  });
});

describe("resolveAgenda participation item", () => {
  function makeInputs(nowMs: number): AgendaInputs {
    const dashboard: DashboardPayload = {
      questionnaireSubmittedAt: null,
      currentCycle: makeCycle(),
      lastRevealedRound: null,
      latestMatch: null,
      latestMatchVisibility: null,
      latestMatchLimitedReason: null,
      recentMatchHistory: [],
      tasks: [],
    };
    const contactPreferences: ContactPreferencesPayload = {
      email: "student@example.com",
      preferredContactChannel: "EMAIL",
      methods: [],
    };
    return {
      dashboard,
      nowMs,
      contactPreferences,
      counterpartDisplayName: null,
      questionnaire: {
        percent: 100,
        confirmedPercent: 100,
        unconfirmedPercent: 0,
        unconfirmedCount: 0,
        submitted: true,
        missingOneLinerIntro: false,
        eligibleToOptIn: true,
        attention: null,
      },
    };
  }

  function participationTitle(nowMs: number): string {
    const item = resolveAgenda(makeInputs(nowMs)).items.find(
      (entry) => entry.id === "PARTICIPATION",
    );
    if (!item) throw new Error("participation item missing");
    return item.title;
  }

  it("invites participation before the deadline and locks after it", () => {
    expect(participationTitle(DEADLINE_MS - 60_000)).toBe(
      "选择本周意向，参加本轮",
    );
    expect(participationTitle(DEADLINE_MS + 60_000)).toBe("本轮报名已截止");
  });

  it("stays deterministic regardless of the real clock", () => {
    vi.spyOn(Date, "now").mockReturnValue(FAR_FUTURE_MS);
    expect(participationTitle(DEADLINE_MS - 60_000)).toBe(
      "选择本周意向，参加本轮",
    );
  });
});

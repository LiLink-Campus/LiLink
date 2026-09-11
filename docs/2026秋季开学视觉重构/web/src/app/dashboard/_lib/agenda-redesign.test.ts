import { describe, expect, it } from "vitest";
import { resolveAgenda, type AgendaInputs } from "./agenda";
import { previewResponse } from "../../../lib/visual-preview/data";
import type { ContactPreferencesPayload, DashboardPayload } from "./types";

function inputs(): AgendaInputs {
  return {
    dashboard: previewResponse("/me/dashboard", "GET", null, "introducedContactCompleted") as DashboardPayload,
    contactPreferences: previewResponse("/me/contact-preferences") as ContactPreferencesPayload,
    counterpartDisplayName: "陈一诺", nowMs: Date.now(),
    questionnaire: { percent: 100, confirmedPercent: 100, unconfirmedPercent: 0, unconfirmedCount: 0, submitted: true, missingOneLinerIntro: false, eligibleToOptIn: true, attention: null },
  };
}

describe("unified profile and retired meetup flow", () => {
  it("does not turn an exchanged contact into a meetup task, including legacy sessions", () => {
    const state = inputs();
    const agenda = resolveAgenda(state);
    expect(agenda.items.some((item) => item.id.startsWith("MEETUP"))).toBe(false);
    expect(agenda.items.flatMap((item) => item.actions).some((action) => action.href?.includes("/meetup"))).toBe(false);
    const match = agenda.items.find((item) => item.id === "MATCH_INTRODUCED_NO_MEETUP");
    expect(match?.title).toContain("已交换联系方式");
    expect(match?.actionable).toBe(false);
  });
  it("does not require an additional contact channel and routes missing introduction to the unified profile", () => {
    const state = inputs();
    state.contactPreferences = { ...state.contactPreferences, preferredContactChannel: "EMAIL", methods: [] };
    expect(resolveAgenda(state).items.find((item) => item.id === "PROFILE_CARD")?.actionable).toBe(false);
    state.questionnaire.missingOneLinerIntro = true;
    const item = resolveAgenda(state).items.find((item) => item.id === "PROFILE_CARD");
    expect(item?.actionable).toBe(true);
    expect(item?.actions[0].href).toBe("/dashboard/profile");
  });
});

import { describe, expect, it } from "vitest";
import {
  buildMeetupFeedbackPayload,
  createMeetupFeedbackFormState,
  toggleMeetupFeedbackTag,
} from "./meetup-feedback";

describe("meetup feedback helpers", () => {
  it("requires the three diagnostic sections", () => {
    expect(
      buildMeetupFeedbackPayload({
        personalFitScore: null,
        interactionQualityScore: 4,
        safetyBoundaryLevel: "NO_CONCERN",
        positiveTags: [],
        issueTags: [],
        note: "",
      }),
    ).toBe("请选择见面后的个人契合感。");

    expect(
      buildMeetupFeedbackPayload({
        personalFitScore: 4,
        interactionQualityScore: null,
        safetyBoundaryLevel: "NO_CONCERN",
        positiveTags: [],
        issueTags: [],
        note: "",
      }),
    ).toBe("请选择这次见面的互动质量。");

    expect(
      buildMeetupFeedbackPayload({
        personalFitScore: 4,
        interactionQualityScore: 4,
        safetyBoundaryLevel: null,
        positiveTags: [],
        issueTags: [],
        note: "",
      }),
    ).toBe("请选择安全与边界感受。");
  });

  it("builds the submit payload with trimmed optional note", () => {
    expect(
      buildMeetupFeedbackPayload({
        personalFitScore: 5,
        interactionQualityScore: 4,
        safetyBoundaryLevel: "NO_CONCERN",
        positiveTags: ["GOOD_LISTENER"],
        issueTags: [],
        note: "  对方沟通很清楚。  ",
      }),
    ).toEqual({
      personalFitScore: 5,
      interactionQualityScore: 4,
      safetyBoundaryLevel: "NO_CONCERN",
      positiveTags: ["GOOD_LISTENER"],
      issueTags: [],
      note: "对方沟通很清楚。",
    });
  });

  it("hydrates state from existing feedback", () => {
    expect(
      createMeetupFeedbackFormState({
        personalFitScore: 3,
        interactionQualityScore: 2,
        safetyBoundaryLevel: "MINOR_CONCERN",
        positiveTags: ["ON_TIME"],
        issueTags: ["LOW_EFFORT"],
        note: null,
      }),
    ).toEqual({
      personalFitScore: 3,
      interactionQualityScore: 2,
      safetyBoundaryLevel: "MINOR_CONCERN",
      positiveTags: ["ON_TIME"],
      issueTags: ["LOW_EFFORT"],
      note: "",
    });
  });

  it("toggles feedback tags", () => {
    expect(toggleMeetupFeedbackTag(["ON_TIME"], "RESPECTFUL")).toEqual([
      "ON_TIME",
      "RESPECTFUL",
    ]);
    expect(toggleMeetupFeedbackTag(["ON_TIME"], "ON_TIME")).toEqual([]);
  });
});

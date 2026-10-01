import { describe, expect, it, vi, afterEach } from "vitest";
import { previewResponse } from "./data";
import { computeQuestionnaireProgress } from "../../app/dashboard/_lib/progress";
import type { QuestionnairePayload, SavedQuestionnairePayload } from "../../app/dashboard/_lib/types";

describe("visual copy fixtures", () => {
  it("provides complete synthetic profile data without network requests", () => {
    const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("No network"));
    const questionnaire = previewResponse("/questionnaire/current") as QuestionnairePayload;
    const savedQuestionnaire = previewResponse("/me/questionnaire") as SavedQuestionnairePayload;
    const progress = computeQuestionnaireProgress({ ...questionnaire, savedQuestionnaire, fallbackDisplayName: "林和" });
    expect(progress.percent).toBe(100);
    expect(progress.eligibleToOptIn).toBe(true);
    expect(previewResponse("/auth/register", "POST", "{}")).toEqual({ ok: true });
    expect(network).not.toHaveBeenCalled();
    network.mockRestore();
  });
  it("returns distinct selectable match states", () => {
    expect(previewResponse("/me/dashboard", "GET", null, "waitingNoResult")).toMatchObject({ latestMatch: null });
    expect(previewResponse("/me/dashboard", "GET", null, "matchedNotIntroduced")).toMatchObject({ latestMatch: { introducedAt: null } });
    expect(previewResponse("/me/dashboard", "GET", null, "introducedContactCompleted")).toMatchObject({ latestMatch: { id: "match-story-002" } });
  });
  it("does not forward unconfigured reads", () => {
    expect(() => previewResponse("/admin/users")).toThrow("此预览暂未配置数据");
  });
});

describe("preview route boundary", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
  it.each([
    ["production", "1", "http://localhost:3101", 404],
    ["development", "0", "http://localhost:3101", 404],
    ["development", "1", "https://example.com", 404],
    ["development", "1", "http://127.0.0.1:3101", 200],
  ])("%s / enabled=%s / %s responds %s", async (env, flag, origin, status) => {
    vi.stubEnv("NODE_ENV", env); vi.stubEnv("NEXT_PUBLIC_LILINK_VISUAL_PREVIEW", flag); vi.resetModules();
    const { NextRequest } = await import("next/server");
    const { GET } = await import("../../app/api/visual-preview/route");
    const response = await GET(new NextRequest(`${origin}/api/visual-preview?path=/auth/me`));
    expect(response.status).toBe(status);
  });
});

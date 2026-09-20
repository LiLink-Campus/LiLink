import { describe, expect, it } from "vitest";
import { profileSavePresentation } from "./save-status";

describe("profile save feedback", () => {
  it("never presents new unsaved edits as saved even before the debounce runs", () => {
    expect(profileSavePresentation("submitted", true, false, true).tone).toBe("pending");
  });
  it("shows in-flight and failure states ahead of a previously submitted profile", () => {
    expect(profileSavePresentation("saving", true, false, true).label).toBe("正在保存…");
    expect(profileSavePresentation("error", true, false, true).tone).toBe("error");
  });
  it("distinguishes saved drafts from complete matching data", () => {
    expect(profileSavePresentation("draft-saved", true, true, false).detail).toContain("上次完整资料");
    expect(profileSavePresentation("draft-saved", false, true, false).tone).toBe("draft");
    expect(profileSavePresentation("submitted", true, false, false).tone).toBe("saved");
  });
  it("does not claim a new empty questionnaire was saved", () => {
    expect(profileSavePresentation("idle", false, false, false).label).toBe("尚未填写");
    expect(profileSavePresentation("idle", false, false, false, true).label).toBe("尚未填写");
  });
  it("distinguishes incomplete existing data from an actually saved draft", () => {
    expect(profileSavePresentation("idle", true, false, false, true).label).toBe("资料待补全");
    expect(profileSavePresentation("draft-saved", false, true, false, true).label).toBe("草稿已自动保存");
  });
});

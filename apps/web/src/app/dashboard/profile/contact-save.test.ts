import { describe, expect, it } from "vitest";
import { phoneDraftForInput, phoneDraftFromValue, phoneDraftValue, prepareContactSave } from "./contact-save";

describe("phone contact editing", () => {
  it("defaults to China and saves a national number in international format", () => {
    expect(phoneDraftFromValue("")).toEqual({ country: "CN", number: "" });
    expect(phoneDraftValue({ country: "CN", number: "138 0013 8000" })).toBe("+8613800138000");
    expect(phoneDraftValue({ country: "CN", number: "" })).toBe("");
  });

  it("keeps a pasted China prefix once and rejects foreign numbers", () => {
    const draft = phoneDraftForInput("+86 138 0013 8000", "CN");
    expect(draft).toEqual({ country: "CN", number: "13800138000" });
    expect(phoneDraftValue(draft)).toBe("+8613800138000");
    expect(prepareContactSave("PHONE", [{ type: "PHONE", value: "+442079460018" }], []).payload).toBeNull();
    expect(phoneDraftFromValue("+442079460018")).toEqual({ country: "CN", number: "+442079460018" });
  });

  it("does not send an empty or invalid selected phone", () => {
    expect(prepareContactSave("PHONE", [], []).payload).toBeNull();
    const invalid = prepareContactSave("PHONE", [{ type: "PHONE", value: "+86123" }], []);
    expect(invalid.payload).toBeNull();
    expect(invalid.error).toContain("中国电话号码");
  });

  it("allows email and WeChat to save while an unsaved phone draft is invalid", () => {
    const drafts = [{ type: "PHONE" as const, value: "+86123" }, { type: "WECHAT" as const, value: " story_wechat " }];
    for (const channel of ["EMAIL", "WECHAT"] as const) {
      expect(prepareContactSave(channel, drafts, []).payload).toEqual({
        preferredContactChannel: channel,
        methods: [{ type: "WECHAT", value: "story_wechat" }],
      });
    }
  });

  it("preserves a saved phone when another channel is chosen after invalid editing", () => {
    const saved = [{ type: "PHONE" as const, value: "+8613800138000" }];
    expect(prepareContactSave("EMAIL", [{ type: "PHONE", value: "+86123" }], saved).payload).toEqual({
      preferredContactChannel: "EMAIL", methods: saved,
    });
  });
});

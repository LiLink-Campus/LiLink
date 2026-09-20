const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  effectiveMatchingAnswers,
  effectivePreferenceForm,
  hasActiveVip,
  HARD_MATCH_KEYS: K,
  LIFESTYLE_QUESTIONS,
  HARD_MATCH_LOOKS,
  isLifestyleQuestion,
} = require("../dist");
const now = Date.parse("2026-09-17T00:00:00Z");
test("only an unrevoked, unexpired redeemed grant enables filtering", () => {
  for (const grants of [
    undefined,
    [],
    [{ expiresAt: null, revokedAt: null }],
    [{ expiresAt: new Date(now), revokedAt: null }],
    [{ expiresAt: new Date(now + 1), revokedAt: new Date(now - 1) }],
  ])
    assert.equal(hasActiveVip(grants, now), false);
  assert.equal(hasActiveVip([{ expiresAt: new Date(now + 1), revokedAt: null }], now), true);
});
test("free matching neutralizes every premium restriction without mutating identity or saved preferences", () => {
  const saved = {
    [K.partnerLooks]: ["9"],
    [K.partnerHeightMin]: 180,
    [K.partnerHeightMax]: 185,
    [K.partnerWeightMin]: 50,
    [K.partnerWeightMax]: 55,
    [K.excludedPartnerSchools]: ["school"],
    [K.excludedPartnerSchoolGenders]: [{ schoolId: "school", genders: ["男"] }],
    [K.gender]: "女",
    [K.partnerGenders]: ["男"],
    [K.partnerAgeMax]: 25,
    exercise_frequency: "每周 1–2 次",
  };
  const effective = effectiveMatchingAnswers(saved, false);
  assert.equal(effective[K.partnerHeightMin], 120);
  assert.equal(effective[K.partnerHeightMax], 230);
  assert.equal(effective[K.partnerWeightMin], null);
  assert.equal(effective[K.partnerWeightMax], null);
  assert.deepEqual(effective[K.partnerLooks], [...HARD_MATCH_LOOKS]);
  assert.deepEqual(effective[K.excludedPartnerSchools], []);
  assert.deepEqual(effective[K.excludedPartnerSchoolGenders], []);
  assert.equal(effective[K.gender], saved[K.gender]);
  assert.deepEqual(effective[K.partnerGenders], ["男"]);
  assert.equal(effective[K.partnerAgeMax], 25);
  assert.equal(effective.exercise_frequency, saved.exercise_frequency);
  assert.equal(saved[K.partnerHeightMin], 180);
  assert.deepEqual(effectiveMatchingAnswers(saved, true), saved);
});
test("locked unanswered preferences cannot prevent a free profile from completing", () => {
  const form = {
    partnerLooks: [],
    partnerHeightMin: "",
    partnerHeightMax: "",
    heightCm: "165",
    weightKg: "50",
  };
  const free = effectivePreferenceForm(form, false);
  assert.deepEqual(free.partnerLooks, [...HARD_MATCH_LOOKS]);
  assert.equal(free.partnerHeightMin, "120");
  assert.equal(free.heightCm, "165");
  assert.equal(free.weightKg, "50");
});
test("lifestyle questions have distinct stable keys and classify into self", () => {
  assert.equal(new Set(LIFESTYLE_QUESTIONS.map((q) => q.key)).size, 3);
  for (const question of LIFESTYLE_QUESTIONS) assert.equal(isLifestyleQuestion(question.key), true);
  assert.equal(isLifestyleQuestion("pace"), false);
});

test("free lifestyle filters survive while exercise requires active VIP", () => {
  const saved = { [K.partnerSmokingStatus]: ["不吸烟"], [K.partnerDrinkingFrequency]: ["不饮酒"], [K.partnerExerciseFrequency]: ["每周 3–4 次"] };
  const free = effectiveMatchingAnswers(saved, false);
  assert.deepEqual(free[K.partnerSmokingStatus], ["不吸烟"]);
  assert.deepEqual(free[K.partnerDrinkingFrequency], ["不饮酒"]);
  assert.deepEqual(free[K.partnerExerciseFrequency], []);
  assert.deepEqual(effectiveMatchingAnswers(saved, true), saved);
  const form = effectivePreferenceForm({ partnerSmokingStatus: ["不吸烟"], partnerDrinkingFrequency: ["不饮酒"], partnerExerciseFrequency: ["每周 3–4 次"] }, false);
  assert.deepEqual(form.partnerExerciseFrequency, []);
  assert.deepEqual(form.partnerSmokingStatus, ["不吸烟"]);
});

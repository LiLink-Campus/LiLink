const test = require("node:test");
const assert = require("node:assert/strict");

const {
  HARD_MATCH_KEYS,
  parseHardMatchAnswers,
  buildDayOptions,
  splitBirthDate,
  areHardMatchAnswersCompatible,
  calculateAgeOnDate,
  readQuestionnaireOneLiner,
} = require("../dist");

test("buildDayOptions returns the correct number of days for leap-year February", () => {
  assert.deepEqual(buildDayOptions("2024", "2"), Array.from({ length: 29 }, (_, index) => index + 1));
});

test("splitBirthDate safely handles malformed input", () => {
  assert.deepEqual(splitBirthDate("invalid"), {
    birthYear: "",
    birthMonth: "",
    birthDay: "",
  });
});

test("parseHardMatchAnswers normalizes valid records", () => {
  const parsed = parseHardMatchAnswers({
    [HARD_MATCH_KEYS.birthDate]: "2003-06-15",
    [HARD_MATCH_KEYS.partnerAgeMin]: 20,
    [HARD_MATCH_KEYS.partnerAgeMax]: 30,
    [HARD_MATCH_KEYS.gender]: "男",
    [HARD_MATCH_KEYS.partnerGenders]: ["女"],
    [HARD_MATCH_KEYS.looks]: "普通人",
    [HARD_MATCH_KEYS.partnerLooks]: ["小帅/美", "顶帅/美"],
    [HARD_MATCH_KEYS.heightCm]: 178,
    [HARD_MATCH_KEYS.partnerHeightMin]: 150,
    [HARD_MATCH_KEYS.partnerHeightMax]: 180,
    [HARD_MATCH_KEYS.oneLinerIntro]: "  喜欢电影   和徒步  ",
    [HARD_MATCH_KEYS.school]: "school-bupt",
    [HARD_MATCH_KEYS.excludedPartnerSchools]: ["school-cuc", "school-cuc"],
    [HARD_MATCH_KEYS.excludedPartnerSchoolGenders]: [
      { schoolId: "school-bupt", genders: ["男", "男"] },
      { schoolId: "school-uestc", genders: ["女", "非二元", "男"] },
    ],
  });

  assert.ok(parsed);
  assert.equal(parsed.oneLinerIntro, "喜欢电影 和徒步");
  assert.equal(parsed.school, "school-bupt");
  assert.deepEqual(parsed.excludedPartnerSchools, ["school-cuc", "school-uestc"]);
  assert.deepEqual(parsed.excludedPartnerSchoolGenders, [
    { schoolId: "school-bupt", genders: ["男"] },
  ]);
});

test("parseHardMatchAnswers rejects out-of-range and incomplete values", () => {
  assert.equal(
    parseHardMatchAnswers({
      [HARD_MATCH_KEYS.birthDate]: "2003-02-30",
      [HARD_MATCH_KEYS.partnerAgeMin]: 30,
      [HARD_MATCH_KEYS.partnerAgeMax]: 20,
      [HARD_MATCH_KEYS.gender]: "男",
      [HARD_MATCH_KEYS.partnerGenders]: [],
      [HARD_MATCH_KEYS.looks]: "普通人",
      [HARD_MATCH_KEYS.partnerLooks]: ["普通人"],
      [HARD_MATCH_KEYS.heightCm]: 178,
      [HARD_MATCH_KEYS.partnerHeightMin]: 150,
      [HARD_MATCH_KEYS.partnerHeightMax]: 180,
      [HARD_MATCH_KEYS.oneLinerIntro]: "",
      [HARD_MATCH_KEYS.school]: "school-bupt",
      [HARD_MATCH_KEYS.excludedPartnerSchools]: [],
    }),
    null,
  );

  assert.equal(
    parseHardMatchAnswers({
      [HARD_MATCH_KEYS.birthDate]: "2003-02-28",
      [HARD_MATCH_KEYS.partnerAgeMin]: 20,
      [HARD_MATCH_KEYS.partnerAgeMax]: 30,
      [HARD_MATCH_KEYS.gender]: "男",
      [HARD_MATCH_KEYS.partnerGenders]: ["女"],
      [HARD_MATCH_KEYS.looks]: "普通人",
      [HARD_MATCH_KEYS.partnerLooks]: ["普通人"],
      [HARD_MATCH_KEYS.heightCm]: 178,
      [HARD_MATCH_KEYS.partnerHeightMin]: 150,
      [HARD_MATCH_KEYS.partnerHeightMax]: 180,
      [HARD_MATCH_KEYS.oneLinerIntro]: "你好",
      [HARD_MATCH_KEYS.school]: "   ",
      [HARD_MATCH_KEYS.excludedPartnerSchools]: [],
    }),
    null,
  );
});

test("calculateAgeOnDate computes UTC age consistently", () => {
  assert.equal(calculateAgeOnDate("2000-04-12", new Date("2026-04-11T00:00:00.000Z")), 25);
  assert.equal(calculateAgeOnDate("2000-04-11", new Date("2026-04-11T00:00:00.000Z")), 26);
});

test("areHardMatchAnswersCompatible checks both directions", () => {
  const left = parseHardMatchAnswers({
    [HARD_MATCH_KEYS.birthDate]: "2003-06-15",
    [HARD_MATCH_KEYS.partnerAgeMin]: 20,
    [HARD_MATCH_KEYS.partnerAgeMax]: 30,
    [HARD_MATCH_KEYS.gender]: "男",
    [HARD_MATCH_KEYS.partnerGenders]: ["女"],
    [HARD_MATCH_KEYS.looks]: "普通人",
    [HARD_MATCH_KEYS.partnerLooks]: ["普通人", "小帅/美"],
    [HARD_MATCH_KEYS.heightCm]: 178,
    [HARD_MATCH_KEYS.partnerHeightMin]: 150,
    [HARD_MATCH_KEYS.partnerHeightMax]: 180,
    [HARD_MATCH_KEYS.oneLinerIntro]: "你好",
    [HARD_MATCH_KEYS.school]: "school-bupt",
    [HARD_MATCH_KEYS.excludedPartnerSchools]: [],
  });
  const right = parseHardMatchAnswers({
    [HARD_MATCH_KEYS.birthDate]: "2004-03-20",
    [HARD_MATCH_KEYS.partnerAgeMin]: 20,
    [HARD_MATCH_KEYS.partnerAgeMax]: 35,
    [HARD_MATCH_KEYS.gender]: "女",
    [HARD_MATCH_KEYS.partnerGenders]: ["男"],
    [HARD_MATCH_KEYS.looks]: "小帅/美",
    [HARD_MATCH_KEYS.partnerLooks]: ["普通人", "小帅/美", "顶帅/美"],
    [HARD_MATCH_KEYS.heightCm]: 165,
    [HARD_MATCH_KEYS.partnerHeightMin]: 170,
    [HARD_MATCH_KEYS.partnerHeightMax]: 185,
    [HARD_MATCH_KEYS.oneLinerIntro]: "你好",
    [HARD_MATCH_KEYS.school]: "school-cuc",
    [HARD_MATCH_KEYS.excludedPartnerSchools]: [],
  });

  assert.equal(
    areHardMatchAnswersCompatible(left, right, new Date("2026-04-11T00:00:00.000Z")),
    true,
  );

  const excluded = parseHardMatchAnswers({
    [HARD_MATCH_KEYS.birthDate]: "2004-03-20",
    [HARD_MATCH_KEYS.partnerAgeMin]: 20,
    [HARD_MATCH_KEYS.partnerAgeMax]: 35,
    [HARD_MATCH_KEYS.gender]: "女",
    [HARD_MATCH_KEYS.partnerGenders]: ["男"],
    [HARD_MATCH_KEYS.looks]: "小帅/美",
    [HARD_MATCH_KEYS.partnerLooks]: ["普通人", "小帅/美", "顶帅/美"],
    [HARD_MATCH_KEYS.heightCm]: 165,
    [HARD_MATCH_KEYS.partnerHeightMin]: 170,
    [HARD_MATCH_KEYS.partnerHeightMax]: 185,
    [HARD_MATCH_KEYS.oneLinerIntro]: "你好",
    [HARD_MATCH_KEYS.school]: "school-cuc",
    [HARD_MATCH_KEYS.excludedPartnerSchools]: ["school-bupt"],
  });

  assert.equal(
    areHardMatchAnswersCompatible(left, excluded, new Date("2026-04-11T00:00:00.000Z")),
    false,
  );

  const excludedBySchoolGender = parseHardMatchAnswers({
    [HARD_MATCH_KEYS.birthDate]: "2004-03-20",
    [HARD_MATCH_KEYS.partnerAgeMin]: 20,
    [HARD_MATCH_KEYS.partnerAgeMax]: 35,
    [HARD_MATCH_KEYS.gender]: "女",
    [HARD_MATCH_KEYS.partnerGenders]: ["男"],
    [HARD_MATCH_KEYS.looks]: "小帅/美",
    [HARD_MATCH_KEYS.partnerLooks]: ["普通人", "小帅/美", "顶帅/美"],
    [HARD_MATCH_KEYS.heightCm]: 165,
    [HARD_MATCH_KEYS.partnerHeightMin]: 170,
    [HARD_MATCH_KEYS.partnerHeightMax]: 185,
    [HARD_MATCH_KEYS.oneLinerIntro]: "你好",
    [HARD_MATCH_KEYS.school]: "school-cuc",
    [HARD_MATCH_KEYS.excludedPartnerSchools]: [],
    [HARD_MATCH_KEYS.excludedPartnerSchoolGenders]: [
      { schoolId: "school-bupt", genders: ["男"] },
    ],
  });

  assert.equal(
    areHardMatchAnswersCompatible(left, excludedBySchoolGender, new Date("2026-04-11T00:00:00.000Z")),
    false,
  );
});

test("readQuestionnaireOneLiner collapses whitespace", () => {
  assert.equal(
    readQuestionnaireOneLiner({
      [HARD_MATCH_KEYS.oneLinerIntro]: "  保持  清晰   ",
    }),
    "保持 清晰",
  );
});

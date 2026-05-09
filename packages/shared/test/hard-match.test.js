const test = require("node:test");
const assert = require("node:assert/strict");

const {
  HARD_MATCH_HEIGHT_MAX_CM,
  HARD_MATCH_HEIGHT_MIN_CM,
  HARD_MATCH_KEYS,
  HEIGHT_OPTIONS,
  parseHardMatchAnswers,
  buildDayOptions,
  splitBirthDate,
  areHardMatchAnswersCompatible,
  calculateAgeOnDate,
  readQuestionnaireOneLiner,
} = require("../dist");

test("buildDayOptions returns the correct number of days for leap-year February", () => {
  assert.deepEqual(
    buildDayOptions("2024", "2"),
    Array.from({ length: 29 }, (_, index) => index + 1),
  );
});

test("splitBirthDate safely handles malformed input", () => {
  assert.deepEqual(splitBirthDate("invalid"), {
    birthYear: "",
    birthMonth: "",
    birthDay: "",
  });
});

test("HEIGHT_OPTIONS spans the full validated height range", () => {
  assert.equal(HEIGHT_OPTIONS[0], HARD_MATCH_HEIGHT_MIN_CM);
  assert.equal(
    HEIGHT_OPTIONS[HEIGHT_OPTIONS.length - 1],
    HARD_MATCH_HEIGHT_MAX_CM,
  );
  assert.equal(
    HEIGHT_OPTIONS.length,
    HARD_MATCH_HEIGHT_MAX_CM - HARD_MATCH_HEIGHT_MIN_CM + 1,
  );
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
  assert.equal(parsed.nationality, "中国");
  assert.deepEqual(parsed.partnerNationalities, []);
  assert.deepEqual(parsed.languages, ["中文"]);
  assert.deepEqual(parsed.partnerLanguages, []);
  assert.equal(parsed.weightKg, null);
  assert.equal(parsed.partnerWeightMin, null);
  assert.equal(parsed.partnerWeightMax, null);
  assert.deepEqual(parsed.excludedPartnerSchools, [
    "school-cuc",
    "school-uestc",
  ]);
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
  assert.equal(
    calculateAgeOnDate("2000-04-12", new Date("2026-04-11T00:00:00.000Z")),
    25,
  );
  assert.equal(
    calculateAgeOnDate("2000-04-11", new Date("2026-04-11T00:00:00.000Z")),
    26,
  );
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
    areHardMatchAnswersCompatible(
      left,
      right,
      new Date("2026-04-11T00:00:00.000Z"),
    ),
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
    areHardMatchAnswersCompatible(
      left,
      excluded,
      new Date("2026-04-11T00:00:00.000Z"),
    ),
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
    areHardMatchAnswersCompatible(
      left,
      excludedBySchoolGender,
      new Date("2026-04-11T00:00:00.000Z"),
    ),
    false,
  );
});

test("areHardMatchAnswersCompatible applies nationality language and nullable weight filters", () => {
  const leftAnswers = {
    [HARD_MATCH_KEYS.birthDate]: "2003-06-15",
    [HARD_MATCH_KEYS.partnerAgeMin]: 20,
    [HARD_MATCH_KEYS.partnerAgeMax]: 30,
    [HARD_MATCH_KEYS.gender]: "男",
    [HARD_MATCH_KEYS.partnerGenders]: ["女"],
    [HARD_MATCH_KEYS.nationality]: "中国",
    [HARD_MATCH_KEYS.partnerNationalities]: ["法国"],
    [HARD_MATCH_KEYS.languages]: ["中文", "英语"],
    [HARD_MATCH_KEYS.partnerLanguages]: ["法语"],
    [HARD_MATCH_KEYS.looks]: "普通人",
    [HARD_MATCH_KEYS.partnerLooks]: ["普通人", "小帅/美"],
    [HARD_MATCH_KEYS.heightCm]: 178,
    [HARD_MATCH_KEYS.partnerHeightMin]: 150,
    [HARD_MATCH_KEYS.partnerHeightMax]: 180,
    [HARD_MATCH_KEYS.weightKg]: null,
    [HARD_MATCH_KEYS.partnerWeightMin]: 50,
    [HARD_MATCH_KEYS.partnerWeightMax]: 80,
    [HARD_MATCH_KEYS.oneLinerIntro]: "你好",
    [HARD_MATCH_KEYS.school]: "school-bupt",
    [HARD_MATCH_KEYS.excludedPartnerSchools]: [],
  };
  const rightAnswers = {
    [HARD_MATCH_KEYS.birthDate]: "2004-03-20",
    [HARD_MATCH_KEYS.partnerAgeMin]: 20,
    [HARD_MATCH_KEYS.partnerAgeMax]: 35,
    [HARD_MATCH_KEYS.gender]: "女",
    [HARD_MATCH_KEYS.partnerGenders]: ["男"],
    [HARD_MATCH_KEYS.nationality]: "法国",
    [HARD_MATCH_KEYS.partnerNationalities]: ["中国"],
    [HARD_MATCH_KEYS.languages]: ["法语", "英语"],
    [HARD_MATCH_KEYS.partnerLanguages]: ["中文"],
    [HARD_MATCH_KEYS.looks]: "小帅/美",
    [HARD_MATCH_KEYS.partnerLooks]: ["普通人", "小帅/美", "顶帅/美"],
    [HARD_MATCH_KEYS.heightCm]: 165,
    [HARD_MATCH_KEYS.partnerHeightMin]: 170,
    [HARD_MATCH_KEYS.partnerHeightMax]: 185,
    [HARD_MATCH_KEYS.weightKg]: 65,
    [HARD_MATCH_KEYS.partnerWeightMin]: 60,
    [HARD_MATCH_KEYS.partnerWeightMax]: 70,
    [HARD_MATCH_KEYS.oneLinerIntro]: "你好",
    [HARD_MATCH_KEYS.school]: "school-cuc",
    [HARD_MATCH_KEYS.excludedPartnerSchools]: [],
  };

  const left = parseHardMatchAnswers(leftAnswers);
  const right = parseHardMatchAnswers(rightAnswers);

  assert.ok(left);
  assert.ok(right);
  assert.equal(
    areHardMatchAnswersCompatible(
      left,
      right,
      new Date("2026-04-11T00:00:00.000Z"),
    ),
    true,
  );

  const languageMismatch = parseHardMatchAnswers({
    ...rightAnswers,
    [HARD_MATCH_KEYS.languages]: ["德语"],
  });
  assert.ok(languageMismatch);
  assert.equal(
    areHardMatchAnswersCompatible(
      left,
      languageMismatch,
      new Date("2026-04-11T00:00:00.000Z"),
    ),
    false,
  );

  const weightMismatch = parseHardMatchAnswers({
    ...rightAnswers,
    [HARD_MATCH_KEYS.weightKg]: 95,
  });
  assert.ok(weightMismatch);
  assert.equal(
    areHardMatchAnswersCompatible(
      left,
      weightMismatch,
      new Date("2026-04-11T00:00:00.000Z"),
    ),
    false,
  );
});

test("areHardMatchAnswersCompatible accepts legacy objects without new optional fields", () => {
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

  assert.ok(left);
  assert.ok(right);

  const legacyLeft = { ...left };
  const legacyRight = { ...right };
  for (const key of [
    "nationality",
    "partnerNationalities",
    "languages",
    "partnerLanguages",
    "weightKg",
    "partnerWeightMin",
    "partnerWeightMax",
  ]) {
    delete legacyLeft[key];
    delete legacyRight[key];
  }

  assert.equal(
    areHardMatchAnswersCompatible(
      legacyLeft,
      legacyRight,
      new Date("2026-04-11T00:00:00.000Z"),
    ),
    true,
  );
});

test("areHardMatchAnswersCompatible treats age range as a soft preference", () => {
  const baseLeft = {
    [HARD_MATCH_KEYS.birthDate]: "2003-06-15",
    [HARD_MATCH_KEYS.partnerAgeMin]: 20,
    [HARD_MATCH_KEYS.partnerAgeMax]: 30,
    [HARD_MATCH_KEYS.gender]: "男",
    [HARD_MATCH_KEYS.partnerGenders]: ["女"],
    [HARD_MATCH_KEYS.looks]: "普通人",
    [HARD_MATCH_KEYS.partnerLooks]: ["普通人", "小帅/美"],
    [HARD_MATCH_KEYS.heightCm]: 178,
    [HARD_MATCH_KEYS.partnerHeightMin]: 150,
    [HARD_MATCH_KEYS.partnerHeightMax]: 195,
    [HARD_MATCH_KEYS.oneLinerIntro]: "你好",
    [HARD_MATCH_KEYS.school]: "school-bupt",
    [HARD_MATCH_KEYS.excludedPartnerSchools]: [],
  };
  const left = parseHardMatchAnswers(baseLeft);

  // Right is the partner the user accidentally excluded with a relative
  // window like "对方比我小 4-5 岁": partnerAgeMin/Max=4..5. Pre-soft this
  // would have been rejected; now it must remain a candidate.
  const rightWithMisreadAgeWindow = parseHardMatchAnswers({
    [HARD_MATCH_KEYS.birthDate]: "2004-03-20",
    [HARD_MATCH_KEYS.partnerAgeMin]: 4,
    [HARD_MATCH_KEYS.partnerAgeMax]: 5,
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

  assert.ok(left);
  assert.ok(rightWithMisreadAgeWindow);
  assert.equal(
    areHardMatchAnswersCompatible(
      left,
      rightWithMisreadAgeWindow,
      new Date("2026-04-11T00:00:00.000Z"),
    ),
    true,
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

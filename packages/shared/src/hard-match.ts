export const HARD_MATCH_GENDERS = ["男", "女", "非二元"] as const;
export const HARD_MATCH_LOOKS = ["普通人", "小帅/美", "顶帅/美"] as const;
export const HARD_MATCH_NATIONALITIES = [
  "中国",
  "美国",
  "加拿大",
  "英国",
  "法国",
  "德国",
  "意大利",
  "西班牙",
  "葡萄牙",
  "荷兰",
  "比利时",
  "瑞士",
  "瑞典",
  "挪威",
  "丹麦",
  "芬兰",
  "爱尔兰",
  "奥地利",
  "波兰",
  "捷克",
  "俄罗斯",
  "乌克兰",
  "土耳其",
  "日本",
  "韩国",
  "新加坡",
  "马来西亚",
  "泰国",
  "越南",
  "印度尼西亚",
  "菲律宾",
  "印度",
  "巴基斯坦",
  "孟加拉国",
  "尼泊尔",
  "斯里兰卡",
  "澳大利亚",
  "新西兰",
  "巴西",
  "阿根廷",
  "墨西哥",
  "智利",
  "哥伦比亚",
  "秘鲁",
  "南非",
  "埃及",
  "摩洛哥",
  "阿联酋",
  "沙特阿拉伯",
  "以色列",
] as const;
export const HARD_MATCH_LANGUAGES = [
  "中文",
  "粤语",
  "英语",
  "日语",
  "韩语",
  "法语",
  "德语",
  "西班牙语",
  "葡萄牙语",
  "意大利语",
  "荷兰语",
  "俄语",
  "乌克兰语",
  "波兰语",
  "捷克语",
  "瑞典语",
  "挪威语",
  "丹麦语",
  "芬兰语",
  "希腊语",
  "土耳其语",
  "阿拉伯语",
  "希伯来语",
  "印地语",
  "乌尔都语",
  "孟加拉语",
  "泰米尔语",
  "泰卢固语",
  "马拉地语",
  "旁遮普语",
  "古吉拉特语",
  "尼泊尔语",
  "僧伽罗语",
  "泰语",
  "越南语",
  "印度尼西亚语",
  "马来语",
  "菲律宾语",
  "缅甸语",
  "高棉语",
  "老挝语",
  "波斯语",
  "库尔德语",
  "斯瓦希里语",
  "阿姆哈拉语",
  "豪萨语",
  "祖鲁语",
  "南非荷兰语",
  "罗马尼亚语",
  "匈牙利语",
] as const;

export const HARD_MATCH_HEIGHT_MIN_CM = 120;
export const HARD_MATCH_HEIGHT_MAX_CM = 230;
export const HARD_MATCH_FORM_HEIGHT_MAX_CM = 220;
export const HARD_MATCH_WEIGHT_MIN_KG = 30;
export const HARD_MATCH_WEIGHT_MAX_KG = 300;
export const HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH = 200;
export const HARD_MATCH_AGE_MIN = 1;
export const HARD_MATCH_AGE_MAX = 100;
export const HARD_MATCH_DEFAULT_NATIONALITY = "中国";
export const HARD_MATCH_DEFAULT_LANGUAGE = "中文";

export const HARD_MATCH_KEYS = {
  birthDate: "hard_birth_date",
  partnerAgeMin: "hard_partner_age_min",
  partnerAgeMax: "hard_partner_age_max",
  gender: "hard_gender",
  partnerGenders: "hard_partner_genders",
  nationality: "hard_nationality",
  partnerNationalities: "hard_partner_nationalities",
  languages: "hard_languages",
  partnerLanguages: "hard_partner_languages",
  looks: "hard_looks",
  partnerLooks: "hard_partner_looks",
  heightCm: "hard_height_cm",
  partnerHeightMin: "hard_partner_height_min",
  partnerHeightMax: "hard_partner_height_max",
  weightKg: "hard_weight_kg",
  partnerWeightMin: "hard_partner_weight_min",
  partnerWeightMax: "hard_partner_weight_max",
  oneLinerIntro: "hard_one_liner_intro",
  school: "hard_school",
  excludedPartnerSchools: "hard_excluded_partner_schools",
  excludedPartnerSchoolGenders: "hard_excluded_partner_school_genders",
} as const;

export type HardMatchGender = (typeof HARD_MATCH_GENDERS)[number];
export type HardMatchLooks = (typeof HARD_MATCH_LOOKS)[number];
export type HardMatchNationality = (typeof HARD_MATCH_NATIONALITIES)[number];
export type HardMatchLanguage = (typeof HARD_MATCH_LANGUAGES)[number];
export type HardMatchSchoolId = string;
export type HardMatchSchoolGenderExclusion = {
  schoolId: HardMatchSchoolId;
  genders: HardMatchGender[];
};
export type HardMatchKey =
  (typeof HARD_MATCH_KEYS)[keyof typeof HARD_MATCH_KEYS];

export type HardMatchAttentionTab = "self" | "partner";

export type HardMatchAttentionField = {
  key: HardMatchKey;
  label: string;
  tab: HardMatchAttentionTab;
  required: boolean;
};

export const HARD_MATCH_ATTENTION_FIELDS = [
  {
    key: HARD_MATCH_KEYS.birthDate,
    label: "出生日期",
    tab: "self",
    required: true,
  },
  {
    key: HARD_MATCH_KEYS.gender,
    label: "性别",
    tab: "self",
    required: true,
  },
  {
    key: HARD_MATCH_KEYS.nationality,
    label: "国籍",
    tab: "self",
    required: false,
  },
  {
    key: HARD_MATCH_KEYS.languages,
    label: "语言",
    tab: "self",
    required: false,
  },
  {
    key: HARD_MATCH_KEYS.looks,
    label: "颜值自评",
    tab: "self",
    required: true,
  },
  {
    key: HARD_MATCH_KEYS.heightCm,
    label: "身高",
    tab: "self",
    required: true,
  },
  {
    key: HARD_MATCH_KEYS.weightKg,
    label: "体重",
    tab: "self",
    required: false,
  },
  {
    key: HARD_MATCH_KEYS.oneLinerIntro,
    label: "一句话介绍",
    tab: "self",
    required: true,
  },
  {
    key: HARD_MATCH_KEYS.partnerAgeMin,
    label: "对方年龄下限",
    tab: "partner",
    required: true,
  },
  {
    key: HARD_MATCH_KEYS.partnerAgeMax,
    label: "对方年龄上限",
    tab: "partner",
    required: true,
  },
  {
    key: HARD_MATCH_KEYS.partnerGenders,
    label: "希望对方的性别",
    tab: "partner",
    required: true,
  },
  {
    key: HARD_MATCH_KEYS.partnerNationalities,
    label: "希望对方的国籍",
    tab: "partner",
    required: false,
  },
  {
    key: HARD_MATCH_KEYS.partnerLanguages,
    label: "希望对方的语言",
    tab: "partner",
    required: false,
  },
  {
    key: HARD_MATCH_KEYS.partnerLooks,
    label: "希望对方的颜值",
    tab: "partner",
    required: true,
  },
  {
    key: HARD_MATCH_KEYS.partnerHeightMin,
    label: "希望对方身高下限",
    tab: "partner",
    required: true,
  },
  {
    key: HARD_MATCH_KEYS.partnerHeightMax,
    label: "希望对方身高上限",
    tab: "partner",
    required: true,
  },
  {
    key: HARD_MATCH_KEYS.partnerWeightMin,
    label: "希望对方体重下限",
    tab: "partner",
    required: false,
  },
  {
    key: HARD_MATCH_KEYS.partnerWeightMax,
    label: "希望对方体重上限",
    tab: "partner",
    required: false,
  },
  {
    key: HARD_MATCH_KEYS.excludedPartnerSchools,
    label: "按学校排除",
    tab: "partner",
    required: false,
  },
  {
    key: HARD_MATCH_KEYS.excludedPartnerSchoolGenders,
    label: "按学校排除性别",
    tab: "partner",
    required: false,
  },
] as const satisfies ReadonlyArray<HardMatchAttentionField>;

const HARD_MATCH_ATTENTION_FIELD_BY_KEY = new Map<string, HardMatchAttentionField>(
  HARD_MATCH_ATTENTION_FIELDS.map((field) => [field.key, field]),
);

export function hardMatchAttentionFields() {
  return [...HARD_MATCH_ATTENTION_FIELDS];
}

export function hardMatchAttentionKeys() {
  return HARD_MATCH_ATTENTION_FIELDS.map((field) => field.key);
}

export function hardMatchAttentionFieldForKey(key: string) {
  return HARD_MATCH_ATTENTION_FIELD_BY_KEY.get(key) ?? null;
}

export type HardMatchAnswers = {
  birthDate: string;
  partnerAgeMin: number;
  partnerAgeMax: number;
  gender: HardMatchGender;
  partnerGenders: HardMatchGender[];
  nationality: HardMatchNationality;
  partnerNationalities: HardMatchNationality[];
  languages: HardMatchLanguage[];
  partnerLanguages: HardMatchLanguage[];
  looks: HardMatchLooks;
  partnerLooks: HardMatchLooks[];
  heightCm: number;
  partnerHeightMin: number;
  partnerHeightMax: number;
  weightKg: number | null;
  partnerWeightMin: number | null;
  partnerWeightMax: number | null;
  oneLinerIntro: string;
  school: HardMatchSchoolId;
  excludedPartnerSchools: HardMatchSchoolId[];
  excludedPartnerSchoolGenders: HardMatchSchoolGenderExclusion[];
};

const HARD_MATCH_KEY_SET = new Set<string>(Object.values(HARD_MATCH_KEYS));

function buildSequentialNumberOptions(min: number, max: number) {
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

export const HEIGHT_OPTIONS = buildSequentialNumberOptions(
  HARD_MATCH_HEIGHT_MIN_CM,
  HARD_MATCH_FORM_HEIGHT_MAX_CM,
);
export const WEIGHT_OPTIONS = buildSequentialNumberOptions(
  HARD_MATCH_WEIGHT_MIN_KG,
  HARD_MATCH_WEIGHT_MAX_KG,
);
export const AGE_OPTIONS = buildSequentialNumberOptions(
  HARD_MATCH_AGE_MIN,
  HARD_MATCH_AGE_MAX,
);
export const MONTH_OPTIONS = buildSequentialNumberOptions(1, 12);

export function buildBirthYearOptions(
  referenceDate = new Date(),
  totalYears = 100,
) {
  const currentYear = referenceDate.getFullYear();
  return Array.from(
    { length: totalYears },
    (_, index) => currentYear - index - 1,
  );
}

export const BIRTH_YEAR_OPTIONS = buildBirthYearOptions();

export function isHardMatchKey(key: string): key is HardMatchKey {
  return HARD_MATCH_KEY_SET.has(key);
}

export function hardMatchQuestionKeys() {
  return [...HARD_MATCH_KEY_SET];
}

export function buildDayOptions(yearText: string, monthText: string) {
  const year = Number(yearText);
  const month = Number(monthText);

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return buildSequentialNumberOptions(1, 31);
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  return buildSequentialNumberOptions(1, daysInMonth);
}

export function splitBirthDate(value: unknown) {
  if (typeof value !== "string") {
    return { birthYear: "", birthMonth: "", birthDay: "" };
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return { birthYear: "", birthMonth: "", birthDay: "" };
  }

  return {
    birthYear: match[1],
    birthMonth: String(Number(match[2])),
    birthDay: String(Number(match[3])),
  };
}

export function normalizeOneLinerIntro(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ");
}

export function readSingleChoice<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
) {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim() as T;
  return allowedValues.includes(normalizedValue) ? normalizedValue : null;
}

export function readNonEmptyString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : null;
}

export function readStringArray<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
) {
  if (!Array.isArray(value)) {
    return [] as T[];
  }

  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim() as T)
        .filter((item) => allowedValues.includes(item)),
    ),
  ];
}

export function readTrimmedStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pushUniqueString(
  values: string[],
  seenValues: Set<string>,
  nextValue: string,
) {
  if (seenValues.has(nextValue)) {
    return;
  }

  seenValues.add(nextValue);
  values.push(nextValue);
}

function orderedGenderSelection(genders: Iterable<HardMatchGender>) {
  const selectedGenders = new Set(genders);
  return HARD_MATCH_GENDERS.filter((gender) => selectedGenders.has(gender));
}

export function normalizeExcludedPartnerPreferences(
  rawValues: {
    excludedPartnerSchools: unknown;
    excludedPartnerSchoolGenders: unknown;
  },
  allowedSchoolIds?: readonly string[],
) {
  const allowedSchoolIdSet =
    allowedSchoolIds == null ? null : new Set(allowedSchoolIds);
  const excludedPartnerSchools: HardMatchSchoolId[] = [];
  const excludedSchoolIdSet = new Set<string>();

  for (const schoolId of readTrimmedStringArray(
    rawValues.excludedPartnerSchools,
  )) {
    if (allowedSchoolIdSet && !allowedSchoolIdSet.has(schoolId)) {
      continue;
    }

    pushUniqueString(excludedPartnerSchools, excludedSchoolIdSet, schoolId);
  }

  const partialSchoolGenderSelections = new Map<string, Set<HardMatchGender>>();
  if (Array.isArray(rawValues.excludedPartnerSchoolGenders)) {
    for (const item of rawValues.excludedPartnerSchoolGenders) {
      if (!isRecord(item)) {
        continue;
      }

      const schoolId = readNonEmptyString(item.schoolId);
      if (!schoolId) {
        continue;
      }

      if (allowedSchoolIdSet && !allowedSchoolIdSet.has(schoolId)) {
        continue;
      }

      if (excludedSchoolIdSet.has(schoolId)) {
        continue;
      }

      const genders = readStringArray(item.genders, HARD_MATCH_GENDERS);
      if (genders.length === 0) {
        continue;
      }

      if (allOptionsSelected(genders, HARD_MATCH_GENDERS)) {
        partialSchoolGenderSelections.delete(schoolId);
        pushUniqueString(excludedPartnerSchools, excludedSchoolIdSet, schoolId);
        continue;
      }

      const accumulatedGenders =
        partialSchoolGenderSelections.get(schoolId) ??
        new Set<HardMatchGender>();
      for (const gender of genders) {
        accumulatedGenders.add(gender);
      }

      if (allOptionsSelected([...accumulatedGenders], HARD_MATCH_GENDERS)) {
        partialSchoolGenderSelections.delete(schoolId);
        pushUniqueString(excludedPartnerSchools, excludedSchoolIdSet, schoolId);
        continue;
      }

      partialSchoolGenderSelections.set(schoolId, accumulatedGenders);
    }
  }

  const excludedPartnerSchoolGenders = [
    ...partialSchoolGenderSelections.entries(),
  ]
    .filter(([schoolId]) => !excludedSchoolIdSet.has(schoolId))
    .map(([schoolId, genders]) => ({
      schoolId,
      genders: orderedGenderSelection(genders),
    }));

  return {
    excludedPartnerSchools,
    excludedPartnerSchoolGenders,
  };
}

export function readIntegerInRange(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }

  if (value < min || value > max) {
    return null;
  }

  return value;
}

export function readNullableIntegerInRange(
  value: unknown,
  min: number,
  max: number,
) {
  if (value == null) {
    return null;
  }

  const normalizedValue = readIntegerInRange(value, min, max);
  return normalizedValue == null ? undefined : normalizedValue;
}

export function readHeightValue(value: unknown, fallback = "") {
  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }

  return fallback;
}

export function normalizeBirthDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmedValue);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidateDate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidateDate.getUTCFullYear() !== year ||
    candidateDate.getUTCMonth() + 1 !== month ||
    candidateDate.getUTCDate() !== day
  ) {
    return null;
  }

  return trimmedValue;
}

export function readQuestionnaireOneLiner(rawAnswers: unknown) {
  if (!rawAnswers || typeof rawAnswers !== "object") {
    return null;
  }

  const normalizedValue = normalizeOneLinerIntro(
    (rawAnswers as Record<string, unknown>)[HARD_MATCH_KEYS.oneLinerIntro],
  );

  return normalizedValue.length > 0 ? normalizedValue : null;
}

function readDefaultedSingleChoice<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  defaultValue: T,
) {
  if (value == null) {
    return defaultValue;
  }

  return readSingleChoice(value, allowedValues);
}

function readDefaultedStringArray<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  defaultValues: readonly T[],
) {
  if (value == null) {
    return [...defaultValues];
  }

  return readStringArray(value, allowedValues);
}

export function parseHardMatchAnswers(
  rawAnswers: Record<string, unknown>,
): HardMatchAnswers | null {
  const partnerAgeMin = readIntegerInRange(
    rawAnswers[HARD_MATCH_KEYS.partnerAgeMin],
    HARD_MATCH_AGE_MIN,
    HARD_MATCH_AGE_MAX,
  );
  const partnerAgeMax = readIntegerInRange(
    rawAnswers[HARD_MATCH_KEYS.partnerAgeMax],
    HARD_MATCH_AGE_MIN,
    HARD_MATCH_AGE_MAX,
  );
  const heightCm = readIntegerInRange(
    rawAnswers[HARD_MATCH_KEYS.heightCm],
    HARD_MATCH_HEIGHT_MIN_CM,
    HARD_MATCH_HEIGHT_MAX_CM,
  );
  const partnerHeightMin = readIntegerInRange(
    rawAnswers[HARD_MATCH_KEYS.partnerHeightMin],
    HARD_MATCH_HEIGHT_MIN_CM,
    HARD_MATCH_HEIGHT_MAX_CM,
  );
  const partnerHeightMax = readIntegerInRange(
    rawAnswers[HARD_MATCH_KEYS.partnerHeightMax],
    HARD_MATCH_HEIGHT_MIN_CM,
    HARD_MATCH_HEIGHT_MAX_CM,
  );
  const birthDate = normalizeBirthDate(rawAnswers[HARD_MATCH_KEYS.birthDate]);
  const gender = readSingleChoice(
    rawAnswers[HARD_MATCH_KEYS.gender],
    HARD_MATCH_GENDERS,
  );
  const partnerGenders = readStringArray(
    rawAnswers[HARD_MATCH_KEYS.partnerGenders],
    HARD_MATCH_GENDERS,
  );
  const looks = readSingleChoice(
    rawAnswers[HARD_MATCH_KEYS.looks],
    HARD_MATCH_LOOKS,
  );
  const partnerLooks = readStringArray(
    rawAnswers[HARD_MATCH_KEYS.partnerLooks],
    HARD_MATCH_LOOKS,
  );
  const nationality = readDefaultedSingleChoice(
    rawAnswers[HARD_MATCH_KEYS.nationality],
    HARD_MATCH_NATIONALITIES,
    HARD_MATCH_DEFAULT_NATIONALITY,
  );
  const partnerNationalities = readStringArray(
    rawAnswers[HARD_MATCH_KEYS.partnerNationalities],
    HARD_MATCH_NATIONALITIES,
  );
  const languages = readDefaultedStringArray(
    rawAnswers[HARD_MATCH_KEYS.languages],
    HARD_MATCH_LANGUAGES,
    [HARD_MATCH_DEFAULT_LANGUAGE],
  );
  const partnerLanguages = readStringArray(
    rawAnswers[HARD_MATCH_KEYS.partnerLanguages],
    HARD_MATCH_LANGUAGES,
  );
  const weightKg = readNullableIntegerInRange(
    rawAnswers[HARD_MATCH_KEYS.weightKg],
    HARD_MATCH_WEIGHT_MIN_KG,
    HARD_MATCH_WEIGHT_MAX_KG,
  );
  const partnerWeightMin = readNullableIntegerInRange(
    rawAnswers[HARD_MATCH_KEYS.partnerWeightMin],
    HARD_MATCH_WEIGHT_MIN_KG,
    HARD_MATCH_WEIGHT_MAX_KG,
  );
  const partnerWeightMax = readNullableIntegerInRange(
    rawAnswers[HARD_MATCH_KEYS.partnerWeightMax],
    HARD_MATCH_WEIGHT_MIN_KG,
    HARD_MATCH_WEIGHT_MAX_KG,
  );
  const oneLinerIntro = normalizeOneLinerIntro(
    rawAnswers[HARD_MATCH_KEYS.oneLinerIntro],
  );
  const school = readNonEmptyString(rawAnswers[HARD_MATCH_KEYS.school]);
  const excludedPartnerPreferences = normalizeExcludedPartnerPreferences({
    excludedPartnerSchools: rawAnswers[HARD_MATCH_KEYS.excludedPartnerSchools],
    excludedPartnerSchoolGenders:
      rawAnswers[HARD_MATCH_KEYS.excludedPartnerSchoolGenders],
  });

  if (
    partnerAgeMin == null ||
    partnerAgeMax == null ||
    heightCm == null ||
    partnerHeightMin == null ||
    partnerHeightMax == null ||
    birthDate == null ||
    gender == null ||
    nationality == null ||
    looks == null ||
    school == null ||
    weightKg === undefined ||
    partnerWeightMin === undefined ||
    partnerWeightMax === undefined
  ) {
    return null;
  }

  if (
    partnerAgeMin > partnerAgeMax ||
    partnerHeightMin > partnerHeightMax ||
    (partnerWeightMin != null &&
      partnerWeightMax != null &&
      partnerWeightMin > partnerWeightMax)
  ) {
    return null;
  }

  if (
    partnerGenders.length === 0 ||
    partnerLooks.length === 0 ||
    languages.length === 0
  ) {
    return null;
  }

  if (
    oneLinerIntro.length === 0 ||
    oneLinerIntro.length > HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH
  ) {
    return null;
  }

  return {
    birthDate,
    partnerAgeMin,
    partnerAgeMax,
    gender,
    partnerGenders,
    nationality,
    partnerNationalities,
    languages,
    partnerLanguages,
    looks,
    partnerLooks,
    heightCm,
    partnerHeightMin,
    partnerHeightMax,
    weightKg,
    partnerWeightMin,
    partnerWeightMax,
    oneLinerIntro,
    school,
    excludedPartnerSchools: excludedPartnerPreferences.excludedPartnerSchools,
    excludedPartnerSchoolGenders:
      excludedPartnerPreferences.excludedPartnerSchoolGenders,
  };
}

function allOptionsSelected<T extends string>(
  selectedValues: readonly T[],
  universe: readonly T[],
) {
  return (
    selectedValues.length === universe.length &&
    universe.every((value) => selectedValues.includes(value))
  );
}

function multiPreferenceMatches<T extends string>(
  selectedValues: readonly T[],
  candidateValue: T,
  universe: readonly T[],
) {
  return (
    allOptionsSelected(selectedValues, universe) ||
    selectedValues.includes(candidateValue)
  );
}

function optionalMultiPreferenceMatches<T extends string>(
  selectedValues: readonly T[] | null | undefined,
  candidateValue: T,
  universe: readonly T[],
) {
  return (
    !selectedValues ||
    selectedValues.length === 0 ||
    multiPreferenceMatches(selectedValues, candidateValue, universe)
  );
}

function optionalLanguagePreferenceMatches(
  selectedValues: readonly HardMatchLanguage[] | null | undefined,
  candidateValues: readonly HardMatchLanguage[],
) {
  return (
    !selectedValues ||
    selectedValues.length === 0 ||
    candidateValues.some((candidateValue) =>
      selectedValues.includes(candidateValue),
    )
  );
}

function optionalRangePreferenceMatches(
  candidateValue: number | null,
  selectedMinimum: number | null,
  selectedMaximum: number | null,
) {
  if (candidateValue == null) {
    return true;
  }

  if (selectedMinimum != null && candidateValue < selectedMinimum) {
    return false;
  }

  if (selectedMaximum != null && candidateValue > selectedMaximum) {
    return false;
  }

  return true;
}

function schoolGenderExclusionMatches(
  schoolGenderExclusions: readonly HardMatchSchoolGenderExclusion[] | undefined,
  candidateSchoolId: HardMatchSchoolId,
  candidateGender: HardMatchGender,
) {
  return (schoolGenderExclusions ?? []).some(
    (entry) =>
      entry.schoolId === candidateSchoolId &&
      entry.genders.includes(candidateGender),
  );
}

export function calculateAgeOnDate(birthDate: string, referenceDate: Date) {
  const [yearText, monthText, dayText] = birthDate.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  let age = referenceDate.getUTCFullYear() - year;
  const hasHadBirthdayThisYear =
    referenceDate.getUTCMonth() + 1 > month ||
    (referenceDate.getUTCMonth() + 1 === month &&
      referenceDate.getUTCDate() >= day);

  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }

  return age;
}

export function areHardMatchAnswersCompatible(
  left: HardMatchAnswers,
  right: HardMatchAnswers,
  revealAt: Date,
) {
  const leftNationality = left.nationality ?? HARD_MATCH_DEFAULT_NATIONALITY;
  const rightNationality = right.nationality ?? HARD_MATCH_DEFAULT_NATIONALITY;
  const defaultLanguages: readonly HardMatchLanguage[] = [
    HARD_MATCH_DEFAULT_LANGUAGE,
  ];
  const leftLanguages: readonly HardMatchLanguage[] = left.languages?.length
    ? left.languages
    : defaultLanguages;
  const rightLanguages: readonly HardMatchLanguage[] = right.languages?.length
    ? right.languages
    : defaultLanguages;

  // Age is intentionally a soft preference: a non-trivial number of users
  // mis-read partnerAgeMin/Max as a relative offset (e.g. "4-5 years
  // younger than me"), which produced absolute ranges like 1-8 that no real
  // candidate satisfies. The matching score in cycles.service.ts rewards
  // pairs that fall inside each other's preferred age window and decays the
  // score for pairs that fall outside, instead of dropping them entirely.

  if (
    !multiPreferenceMatches(
      left.partnerGenders,
      right.gender,
      HARD_MATCH_GENDERS,
    ) ||
    !multiPreferenceMatches(
      right.partnerGenders,
      left.gender,
      HARD_MATCH_GENDERS,
    )
  ) {
    return false;
  }

  if (
    !optionalMultiPreferenceMatches(
      left.partnerNationalities,
      rightNationality,
      HARD_MATCH_NATIONALITIES,
    ) ||
    !optionalMultiPreferenceMatches(
      right.partnerNationalities,
      leftNationality,
      HARD_MATCH_NATIONALITIES,
    )
  ) {
    return false;
  }

  if (
    !optionalLanguagePreferenceMatches(left.partnerLanguages, rightLanguages) ||
    !optionalLanguagePreferenceMatches(right.partnerLanguages, leftLanguages)
  ) {
    return false;
  }

  if (
    left.heightCm < right.partnerHeightMin ||
    left.heightCm > right.partnerHeightMax ||
    right.heightCm < left.partnerHeightMin ||
    right.heightCm > left.partnerHeightMax
  ) {
    return false;
  }

  if (
    !optionalRangePreferenceMatches(
      left.weightKg,
      right.partnerWeightMin,
      right.partnerWeightMax,
    ) ||
    !optionalRangePreferenceMatches(
      right.weightKg,
      left.partnerWeightMin,
      left.partnerWeightMax,
    )
  ) {
    return false;
  }

  if (
    left.excludedPartnerSchools.includes(right.school) ||
    right.excludedPartnerSchools.includes(left.school)
  ) {
    return false;
  }

  if (
    schoolGenderExclusionMatches(
      left.excludedPartnerSchoolGenders,
      right.school,
      right.gender,
    ) ||
    schoolGenderExclusionMatches(
      right.excludedPartnerSchoolGenders,
      left.school,
      left.gender,
    )
  ) {
    return false;
  }

  return true;
}

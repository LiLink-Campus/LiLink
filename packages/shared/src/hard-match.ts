import { DEFAULT_LOCALE, type SupportedLocale } from "./locale";

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

export const HARD_MATCH_GENDER_LABELS_BY_LOCALE: Record<
  HardMatchGender,
  Record<SupportedLocale, string>
> = {
  男: {
    "zh-CN": "男",
    "en-US": "Male",
  },
  女: {
    "zh-CN": "女",
    "en-US": "Female",
  },
  非二元: {
    "zh-CN": "非二元",
    "en-US": "Non-binary",
  },
};

export const HARD_MATCH_LOOKS_LABELS_BY_LOCALE: Record<
  HardMatchLooks,
  Record<SupportedLocale, string>
> = {
  普通人: {
    "zh-CN": "普通人",
    "en-US": "Average",
  },
  "小帅/美": {
    "zh-CN": "小帅/美",
    "en-US": "Attractive",
  },
  "顶帅/美": {
    "zh-CN": "顶帅/美",
    "en-US": "Very attractive",
  },
};

export const HARD_MATCH_NATIONALITY_LABELS_BY_LOCALE: Record<
  HardMatchNationality,
  Record<SupportedLocale, string>
> = {
  中国: { "zh-CN": "中国", "en-US": "China" },
  美国: { "zh-CN": "美国", "en-US": "United States" },
  加拿大: { "zh-CN": "加拿大", "en-US": "Canada" },
  英国: { "zh-CN": "英国", "en-US": "United Kingdom" },
  法国: { "zh-CN": "法国", "en-US": "France" },
  德国: { "zh-CN": "德国", "en-US": "Germany" },
  意大利: { "zh-CN": "意大利", "en-US": "Italy" },
  西班牙: { "zh-CN": "西班牙", "en-US": "Spain" },
  葡萄牙: { "zh-CN": "葡萄牙", "en-US": "Portugal" },
  荷兰: { "zh-CN": "荷兰", "en-US": "Netherlands" },
  比利时: { "zh-CN": "比利时", "en-US": "Belgium" },
  瑞士: { "zh-CN": "瑞士", "en-US": "Switzerland" },
  瑞典: { "zh-CN": "瑞典", "en-US": "Sweden" },
  挪威: { "zh-CN": "挪威", "en-US": "Norway" },
  丹麦: { "zh-CN": "丹麦", "en-US": "Denmark" },
  芬兰: { "zh-CN": "芬兰", "en-US": "Finland" },
  爱尔兰: { "zh-CN": "爱尔兰", "en-US": "Ireland" },
  奥地利: { "zh-CN": "奥地利", "en-US": "Austria" },
  波兰: { "zh-CN": "波兰", "en-US": "Poland" },
  捷克: { "zh-CN": "捷克", "en-US": "Czechia" },
  俄罗斯: { "zh-CN": "俄罗斯", "en-US": "Russia" },
  乌克兰: { "zh-CN": "乌克兰", "en-US": "Ukraine" },
  土耳其: { "zh-CN": "土耳其", "en-US": "Turkey" },
  日本: { "zh-CN": "日本", "en-US": "Japan" },
  韩国: { "zh-CN": "韩国", "en-US": "South Korea" },
  新加坡: { "zh-CN": "新加坡", "en-US": "Singapore" },
  马来西亚: { "zh-CN": "马来西亚", "en-US": "Malaysia" },
  泰国: { "zh-CN": "泰国", "en-US": "Thailand" },
  越南: { "zh-CN": "越南", "en-US": "Vietnam" },
  印度尼西亚: { "zh-CN": "印度尼西亚", "en-US": "Indonesia" },
  菲律宾: { "zh-CN": "菲律宾", "en-US": "Philippines" },
  印度: { "zh-CN": "印度", "en-US": "India" },
  巴基斯坦: { "zh-CN": "巴基斯坦", "en-US": "Pakistan" },
  孟加拉国: { "zh-CN": "孟加拉国", "en-US": "Bangladesh" },
  尼泊尔: { "zh-CN": "尼泊尔", "en-US": "Nepal" },
  斯里兰卡: { "zh-CN": "斯里兰卡", "en-US": "Sri Lanka" },
  澳大利亚: { "zh-CN": "澳大利亚", "en-US": "Australia" },
  新西兰: { "zh-CN": "新西兰", "en-US": "New Zealand" },
  巴西: { "zh-CN": "巴西", "en-US": "Brazil" },
  阿根廷: { "zh-CN": "阿根廷", "en-US": "Argentina" },
  墨西哥: { "zh-CN": "墨西哥", "en-US": "Mexico" },
  智利: { "zh-CN": "智利", "en-US": "Chile" },
  哥伦比亚: { "zh-CN": "哥伦比亚", "en-US": "Colombia" },
  秘鲁: { "zh-CN": "秘鲁", "en-US": "Peru" },
  南非: { "zh-CN": "南非", "en-US": "South Africa" },
  埃及: { "zh-CN": "埃及", "en-US": "Egypt" },
  摩洛哥: { "zh-CN": "摩洛哥", "en-US": "Morocco" },
  阿联酋: { "zh-CN": "阿联酋", "en-US": "United Arab Emirates" },
  沙特阿拉伯: { "zh-CN": "沙特阿拉伯", "en-US": "Saudi Arabia" },
  以色列: { "zh-CN": "以色列", "en-US": "Israel" },
};

export const HARD_MATCH_LANGUAGE_LABELS_BY_LOCALE: Record<
  HardMatchLanguage,
  Record<SupportedLocale, string>
> = {
  中文: { "zh-CN": "中文", "en-US": "Chinese" },
  粤语: { "zh-CN": "粤语", "en-US": "Cantonese" },
  英语: { "zh-CN": "英语", "en-US": "English" },
  日语: { "zh-CN": "日语", "en-US": "Japanese" },
  韩语: { "zh-CN": "韩语", "en-US": "Korean" },
  法语: { "zh-CN": "法语", "en-US": "French" },
  德语: { "zh-CN": "德语", "en-US": "German" },
  西班牙语: { "zh-CN": "西班牙语", "en-US": "Spanish" },
  葡萄牙语: { "zh-CN": "葡萄牙语", "en-US": "Portuguese" },
  意大利语: { "zh-CN": "意大利语", "en-US": "Italian" },
  荷兰语: { "zh-CN": "荷兰语", "en-US": "Dutch" },
  俄语: { "zh-CN": "俄语", "en-US": "Russian" },
  乌克兰语: { "zh-CN": "乌克兰语", "en-US": "Ukrainian" },
  波兰语: { "zh-CN": "波兰语", "en-US": "Polish" },
  捷克语: { "zh-CN": "捷克语", "en-US": "Czech" },
  瑞典语: { "zh-CN": "瑞典语", "en-US": "Swedish" },
  挪威语: { "zh-CN": "挪威语", "en-US": "Norwegian" },
  丹麦语: { "zh-CN": "丹麦语", "en-US": "Danish" },
  芬兰语: { "zh-CN": "芬兰语", "en-US": "Finnish" },
  希腊语: { "zh-CN": "希腊语", "en-US": "Greek" },
  土耳其语: { "zh-CN": "土耳其语", "en-US": "Turkish" },
  阿拉伯语: { "zh-CN": "阿拉伯语", "en-US": "Arabic" },
  希伯来语: { "zh-CN": "希伯来语", "en-US": "Hebrew" },
  印地语: { "zh-CN": "印地语", "en-US": "Hindi" },
  乌尔都语: { "zh-CN": "乌尔都语", "en-US": "Urdu" },
  孟加拉语: { "zh-CN": "孟加拉语", "en-US": "Bengali" },
  泰米尔语: { "zh-CN": "泰米尔语", "en-US": "Tamil" },
  泰卢固语: { "zh-CN": "泰卢固语", "en-US": "Telugu" },
  马拉地语: { "zh-CN": "马拉地语", "en-US": "Marathi" },
  旁遮普语: { "zh-CN": "旁遮普语", "en-US": "Punjabi" },
  古吉拉特语: { "zh-CN": "古吉拉特语", "en-US": "Gujarati" },
  尼泊尔语: { "zh-CN": "尼泊尔语", "en-US": "Nepali" },
  僧伽罗语: { "zh-CN": "僧伽罗语", "en-US": "Sinhala" },
  泰语: { "zh-CN": "泰语", "en-US": "Thai" },
  越南语: { "zh-CN": "越南语", "en-US": "Vietnamese" },
  印度尼西亚语: { "zh-CN": "印度尼西亚语", "en-US": "Indonesian" },
  马来语: { "zh-CN": "马来语", "en-US": "Malay" },
  菲律宾语: { "zh-CN": "菲律宾语", "en-US": "Filipino" },
  缅甸语: { "zh-CN": "缅甸语", "en-US": "Burmese" },
  高棉语: { "zh-CN": "高棉语", "en-US": "Khmer" },
  老挝语: { "zh-CN": "老挝语", "en-US": "Lao" },
  波斯语: { "zh-CN": "波斯语", "en-US": "Persian" },
  库尔德语: { "zh-CN": "库尔德语", "en-US": "Kurdish" },
  斯瓦希里语: { "zh-CN": "斯瓦希里语", "en-US": "Swahili" },
  阿姆哈拉语: { "zh-CN": "阿姆哈拉语", "en-US": "Amharic" },
  豪萨语: { "zh-CN": "豪萨语", "en-US": "Hausa" },
  祖鲁语: { "zh-CN": "祖鲁语", "en-US": "Zulu" },
  南非荷兰语: { "zh-CN": "南非荷兰语", "en-US": "Afrikaans" },
  罗马尼亚语: { "zh-CN": "罗马尼亚语", "en-US": "Romanian" },
  匈牙利语: { "zh-CN": "匈牙利语", "en-US": "Hungarian" },
};

export function hardMatchGenderLabel(
  gender: HardMatchGender,
  locale: SupportedLocale = DEFAULT_LOCALE,
) {
  return HARD_MATCH_GENDER_LABELS_BY_LOCALE[gender][locale];
}

export function hardMatchLooksLabel(
  looks: HardMatchLooks,
  locale: SupportedLocale = DEFAULT_LOCALE,
) {
  return HARD_MATCH_LOOKS_LABELS_BY_LOCALE[looks][locale];
}

export function hardMatchNationalityLabel(
  nationality: HardMatchNationality,
  locale: SupportedLocale = DEFAULT_LOCALE,
) {
  return HARD_MATCH_NATIONALITY_LABELS_BY_LOCALE[nationality][locale];
}

export function hardMatchLanguageLabel(
  language: HardMatchLanguage,
  locale: SupportedLocale = DEFAULT_LOCALE,
) {
  return HARD_MATCH_LANGUAGE_LABELS_BY_LOCALE[language][locale];
}

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
  const leftNationality =
    left.nationality ?? HARD_MATCH_DEFAULT_NATIONALITY;
  const rightNationality =
    right.nationality ?? HARD_MATCH_DEFAULT_NATIONALITY;
  const defaultLanguages: readonly HardMatchLanguage[] = [
    HARD_MATCH_DEFAULT_LANGUAGE,
  ];
  const leftLanguages: readonly HardMatchLanguage[] =
    left.languages?.length ? left.languages : defaultLanguages;
  const rightLanguages: readonly HardMatchLanguage[] =
    right.languages?.length ? right.languages : defaultLanguages;

  const leftAge = calculateAgeOnDate(left.birthDate, revealAt);
  const rightAge = calculateAgeOnDate(right.birthDate, revealAt);

  if (
    leftAge < right.partnerAgeMin ||
    leftAge > right.partnerAgeMax ||
    rightAge < left.partnerAgeMin ||
    rightAge > left.partnerAgeMax
  ) {
    return false;
  }

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
    !optionalLanguagePreferenceMatches(
      left.partnerLanguages,
      rightLanguages,
    ) ||
    !optionalLanguagePreferenceMatches(right.partnerLanguages, leftLanguages)
  ) {
    return false;
  }

  if (
    !multiPreferenceMatches(left.partnerLooks, right.looks, HARD_MATCH_LOOKS) ||
    !multiPreferenceMatches(right.partnerLooks, left.looks, HARD_MATCH_LOOKS)
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

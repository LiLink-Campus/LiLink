import {
  AGE_OPTIONS,
  BIRTH_YEAR_OPTIONS,
  HARD_MATCH_DEFAULT_LANGUAGE,
  HARD_MATCH_DEFAULT_NATIONALITY,
  HARD_MATCH_FORM_HEIGHT_MAX_CM,
  HARD_MATCH_GENDERS,
  HARD_MATCH_HEIGHT_MIN_CM,
  HARD_MATCH_KEYS,
  HARD_MATCH_LANGUAGES,
  HARD_MATCH_LOOKS,
  HARD_MATCH_NATIONALITIES,
  HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH,
  HARD_MATCH_WEIGHT_MAX_KG,
  HARD_MATCH_WEIGHT_MIN_KG,
  HEIGHT_OPTIONS,
  MONTH_OPTIONS,
  WEIGHT_OPTIONS,
  buildDayOptions,
  hardMatchGenderLabel,
  hardMatchLanguageLabel,
  hardMatchLooksLabel,
  hardMatchNationalityLabel,
  normalizeExcludedPartnerPreferences,
  normalizeOneLinerIntro,
  readHeightValue,
  readIntegerInRange,
  readSingleChoice,
  readStringArray,
  splitBirthDate,
  type HardMatchSchoolGenderExclusion,
  type SupportedLocale,
} from "@lilink/shared";

export {
  AGE_OPTIONS,
  BIRTH_YEAR_OPTIONS,
  HARD_MATCH_GENDERS,
  HARD_MATCH_KEYS,
  HARD_MATCH_LANGUAGES,
  HARD_MATCH_LOOKS,
  HARD_MATCH_NATIONALITIES,
  HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH,
  HARD_MATCH_WEIGHT_MAX_KG,
  HARD_MATCH_WEIGHT_MIN_KG,
  HEIGHT_OPTIONS,
  MONTH_OPTIONS,
  WEIGHT_OPTIONS,
  buildDayOptions,
  hardMatchGenderLabel,
  hardMatchLanguageLabel,
  hardMatchLooksLabel,
  hardMatchNationalityLabel,
};

export type HardMatchSchoolOption = {
  id: string;
  name: string;
};

export type { HardMatchSchoolGenderExclusion };

export type HardMatchFormState = {
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  partnerAgeMin: string;
  partnerAgeMax: string;
  gender: string;
  partnerGenders: string[];
  nationality: string;
  partnerNationalities: string[];
  languages: string[];
  partnerLanguages: string[];
  looks: string;
  partnerLooks: string[];
  heightCm: string;
  partnerHeightMin: string;
  partnerHeightMax: string;
  weightKg: string;
  partnerWeightMin: string;
  partnerWeightMax: string;
  oneLinerIntro: string;
  excludedPartnerSchools: string[];
  excludedPartnerSchoolGenders: HardMatchSchoolGenderExclusion[];
};

export function createEmptyHardMatchForm(): HardMatchFormState {
  return {
    birthYear: "",
    birthMonth: "",
    birthDay: "",
    partnerAgeMin: "1",
    partnerAgeMax: "100",
    gender: "",
    partnerGenders: [],
    nationality: HARD_MATCH_DEFAULT_NATIONALITY,
    partnerNationalities: [],
    languages: [HARD_MATCH_DEFAULT_LANGUAGE],
    partnerLanguages: [],
    looks: "",
    partnerLooks: [],
    heightCm: "",
    partnerHeightMin: String(HARD_MATCH_HEIGHT_MIN_CM),
    partnerHeightMax: String(HARD_MATCH_FORM_HEIGHT_MAX_CM),
    weightKg: "",
    partnerWeightMin: "",
    partnerWeightMax: "",
    oneLinerIntro: "",
    excludedPartnerSchools: [],
    excludedPartnerSchoolGenders: [],
  };
}

function readWeightValue(value: unknown) {
  const normalizedValue = readIntegerInRange(
    value,
    HARD_MATCH_WEIGHT_MIN_KG,
    HARD_MATCH_WEIGHT_MAX_KG,
  );

  return normalizedValue == null ? "" : String(normalizedValue);
}

function readStringArrayWithDefault<T extends string>(
  value: unknown,
  allowedValues: readonly T[],
  defaultValues: readonly T[],
) {
  const normalizedValues = readStringArray(value, allowedValues);
  return normalizedValues.length > 0 ? normalizedValues : [...defaultValues];
}

function optionalNumberFromText(value: string): number | null {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return null;
  }

  return /^\d+$/.test(trimmedValue) ? Number(trimmedValue) : Number.NaN;
}

function weightValueIsOutOfRange(value: number | null) {
  return (
    value != null &&
    (value < HARD_MATCH_WEIGHT_MIN_KG || value > HARD_MATCH_WEIGHT_MAX_KG)
  );
}

export function hardMatchFormFromAnswers(
  savedAnswers: Record<string, unknown> | undefined,
  schoolOptions: HardMatchSchoolOption[],
): HardMatchFormState {
  const birthDate = splitBirthDate(savedAnswers?.[HARD_MATCH_KEYS.birthDate]);
  const allowedSchoolIds = schoolOptions.map((school) => school.id);
  const excludedPartnerPreferences = normalizeExcludedPartnerPreferences(
    {
      excludedPartnerSchools:
        savedAnswers?.[HARD_MATCH_KEYS.excludedPartnerSchools],
      excludedPartnerSchoolGenders:
        savedAnswers?.[HARD_MATCH_KEYS.excludedPartnerSchoolGenders],
    },
    allowedSchoolIds,
  );

  return {
    ...createEmptyHardMatchForm(),
    ...birthDate,
    partnerAgeMin: String(
      typeof savedAnswers?.[HARD_MATCH_KEYS.partnerAgeMin] === "number"
        ? savedAnswers[HARD_MATCH_KEYS.partnerAgeMin]
        : 1,
    ),
    partnerAgeMax: String(
      typeof savedAnswers?.[HARD_MATCH_KEYS.partnerAgeMax] === "number"
        ? savedAnswers[HARD_MATCH_KEYS.partnerAgeMax]
        : 100,
    ),
    gender:
      readSingleChoice(
        savedAnswers?.[HARD_MATCH_KEYS.gender],
        HARD_MATCH_GENDERS,
      ) ?? "",
    partnerGenders: readStringArray(
      savedAnswers?.[HARD_MATCH_KEYS.partnerGenders],
      HARD_MATCH_GENDERS,
    ),
    nationality:
      readSingleChoice(
        savedAnswers?.[HARD_MATCH_KEYS.nationality],
        HARD_MATCH_NATIONALITIES,
      ) ?? HARD_MATCH_DEFAULT_NATIONALITY,
    partnerNationalities: readStringArray(
      savedAnswers?.[HARD_MATCH_KEYS.partnerNationalities],
      HARD_MATCH_NATIONALITIES,
    ),
    languages: readStringArrayWithDefault(
      savedAnswers?.[HARD_MATCH_KEYS.languages],
      HARD_MATCH_LANGUAGES,
      [HARD_MATCH_DEFAULT_LANGUAGE],
    ),
    partnerLanguages: readStringArray(
      savedAnswers?.[HARD_MATCH_KEYS.partnerLanguages],
      HARD_MATCH_LANGUAGES,
    ),
    looks:
      readSingleChoice(
        savedAnswers?.[HARD_MATCH_KEYS.looks],
        HARD_MATCH_LOOKS,
      ) ?? "",
    partnerLooks: readStringArray(
      savedAnswers?.[HARD_MATCH_KEYS.partnerLooks],
      HARD_MATCH_LOOKS,
    ),
    heightCm: readHeightValue(savedAnswers?.[HARD_MATCH_KEYS.heightCm]),
    partnerHeightMin: readHeightValue(
      savedAnswers?.[HARD_MATCH_KEYS.partnerHeightMin],
      String(HARD_MATCH_HEIGHT_MIN_CM),
    ),
    partnerHeightMax: readHeightValue(
      savedAnswers?.[HARD_MATCH_KEYS.partnerHeightMax],
      String(HARD_MATCH_FORM_HEIGHT_MAX_CM),
    ),
    weightKg: readWeightValue(savedAnswers?.[HARD_MATCH_KEYS.weightKg]),
    partnerWeightMin: readWeightValue(
      savedAnswers?.[HARD_MATCH_KEYS.partnerWeightMin],
    ),
    partnerWeightMax: readWeightValue(
      savedAnswers?.[HARD_MATCH_KEYS.partnerWeightMax],
    ),
    oneLinerIntro: normalizeOneLinerIntro(
      savedAnswers?.[HARD_MATCH_KEYS.oneLinerIntro],
    ),
    excludedPartnerSchools: excludedPartnerPreferences.excludedPartnerSchools,
    excludedPartnerSchoolGenders:
      excludedPartnerPreferences.excludedPartnerSchoolGenders,
  };
}

export function toggleMultiSelectValue(
  currentValues: string[],
  nextValue: string,
): string[] {
  return currentValues.includes(nextValue)
    ? currentValues.filter((value) => value !== nextValue)
    : [...currentValues, nextValue];
}

export function schoolGenderExclusionFor(
  exclusions: HardMatchSchoolGenderExclusion[],
  schoolId: string,
) {
  return exclusions.find((entry) => entry.schoolId === schoolId)?.genders ?? [];
}

export function setSchoolGenderExclusion(
  exclusions: HardMatchSchoolGenderExclusion[],
  schoolId: string,
  genders: string[],
): HardMatchSchoolGenderExclusion[] {
  const normalizedGenders = readStringArray(genders, HARD_MATCH_GENDERS);
  const nextExclusions = exclusions.filter(
    (entry) => entry.schoolId !== schoolId,
  );

  if (normalizedGenders.length === 0) {
    return nextExclusions;
  }

  return [
    ...nextExclusions,
    {
      schoolId,
      genders: HARD_MATCH_GENDERS.filter((gender) =>
        normalizedGenders.includes(gender),
      ),
    },
  ];
}

export function buildHardMatchAnswerRecord(formState: HardMatchFormState) {
  if (
    !formState.birthYear ||
    !formState.birthMonth ||
    !formState.birthDay ||
    !formState.nationality ||
    !formState.gender ||
    !formState.looks ||
    !formState.heightCm
  ) {
    throw new Error("请先完成所有硬性条件题目。");
  }

  if (
    formState.partnerGenders.length === 0 ||
    formState.partnerLooks.length === 0 ||
    formState.languages.length === 0
  ) {
    throw new Error("多选题至少要选一项。");
  }

  const oneLinerIntro = normalizeOneLinerIntro(formState.oneLinerIntro);
  if (!oneLinerIntro) {
    throw new Error("请填写一句话介绍。");
  }

  if (oneLinerIntro.length > HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH) {
    throw new Error(
      `一句话介绍请不要超过 ${HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH} 字。`,
    );
  }

  const partnerAgeMin = Number(formState.partnerAgeMin);
  const partnerAgeMax = Number(formState.partnerAgeMax);

  if (partnerAgeMin > partnerAgeMax) {
    throw new Error("希望对方年龄下限不能大于上限。");
  }

  const heightCm = Number(formState.heightCm);
  const partnerHeightMin = Number(formState.partnerHeightMin);
  const partnerHeightMax = Number(formState.partnerHeightMax);

  if (partnerHeightMin > partnerHeightMax) {
    throw new Error("希望对方身高下限不能大于上限。");
  }

  const weightKg = optionalNumberFromText(formState.weightKg);
  const partnerWeightMin = optionalNumberFromText(formState.partnerWeightMin);
  const partnerWeightMax = optionalNumberFromText(formState.partnerWeightMax);

  if (
    Number.isNaN(weightKg) ||
    weightValueIsOutOfRange(weightKg)
  ) {
    throw new Error("体重需要在 30-300 kg 之间。");
  }

  if (
    Number.isNaN(partnerWeightMin) ||
    Number.isNaN(partnerWeightMax) ||
    weightValueIsOutOfRange(partnerWeightMin) ||
    weightValueIsOutOfRange(partnerWeightMax)
  ) {
    throw new Error("希望对方体重需要在 30-300 kg 之间。");
  }

  if (
    partnerWeightMin != null &&
    partnerWeightMax != null &&
    partnerWeightMin > partnerWeightMax
  ) {
    throw new Error("希望对方体重下限不能大于上限。");
  }

  const excludedPartnerPreferences = normalizeExcludedPartnerPreferences({
    excludedPartnerSchools: formState.excludedPartnerSchools,
    excludedPartnerSchoolGenders: formState.excludedPartnerSchoolGenders,
  });
  const birthDate = `${formState.birthYear}-${formState.birthMonth.padStart(2, "0")}-${formState.birthDay.padStart(2, "0")}`;

  return {
    [HARD_MATCH_KEYS.birthDate]: birthDate,
    [HARD_MATCH_KEYS.partnerAgeMin]: partnerAgeMin,
    [HARD_MATCH_KEYS.partnerAgeMax]: partnerAgeMax,
    [HARD_MATCH_KEYS.gender]: formState.gender,
    [HARD_MATCH_KEYS.partnerGenders]: formState.partnerGenders,
    [HARD_MATCH_KEYS.nationality]: formState.nationality,
    [HARD_MATCH_KEYS.partnerNationalities]: formState.partnerNationalities,
    [HARD_MATCH_KEYS.languages]: formState.languages,
    [HARD_MATCH_KEYS.partnerLanguages]: formState.partnerLanguages,
    [HARD_MATCH_KEYS.looks]: formState.looks,
    [HARD_MATCH_KEYS.partnerLooks]: formState.partnerLooks,
    [HARD_MATCH_KEYS.heightCm]: heightCm,
    [HARD_MATCH_KEYS.partnerHeightMin]: partnerHeightMin,
    [HARD_MATCH_KEYS.partnerHeightMax]: partnerHeightMax,
    [HARD_MATCH_KEYS.weightKg]: weightKg,
    [HARD_MATCH_KEYS.partnerWeightMin]: partnerWeightMin,
    [HARD_MATCH_KEYS.partnerWeightMax]: partnerWeightMax,
    [HARD_MATCH_KEYS.oneLinerIntro]: oneLinerIntro,
    [HARD_MATCH_KEYS.excludedPartnerSchools]:
      excludedPartnerPreferences.excludedPartnerSchools,
    [HARD_MATCH_KEYS.excludedPartnerSchoolGenders]:
      excludedPartnerPreferences.excludedPartnerSchoolGenders,
  };
}

const HARD_MATCH_FORM_ERROR_COPY = {
  "zh-CN": {
    incomplete: "请先完成所有硬性条件题目。",
    multiRequired: "希望对方的条件为多选题，至少要选一项。",
    introRequired: "请填写一句话介绍。",
    introTooLong: (max: number) => `一句话介绍请不要超过 ${max} 字。`,
    ageRange: "希望对方年龄下限不能大于上限。",
    heightRange: "希望对方身高下限不能大于上限。",
    ownWeightRange: "体重需要在 30-300 kg 之间。",
    partnerWeightRange: "希望对方体重需要在 30-300 kg 之间。",
    partnerWeightOrder: "希望对方体重下限不能大于上限。",
  },
  "en-US": {
    incomplete: "Please complete all hard-preference questions first.",
    multiRequired:
      "Partner preferences are multi-select fields. Choose at least one option.",
    introRequired: "Please add a one-line intro.",
    introTooLong: (max: number) =>
      `One-line intro must be no longer than ${max} characters.`,
    ageRange: "Partner age minimum cannot be greater than maximum.",
    heightRange: "Partner height minimum cannot be greater than maximum.",
    ownWeightRange: "Weight must be between 30 and 300 kg.",
    partnerWeightRange: "Preferred partner weight must be between 30 and 300 kg.",
    partnerWeightOrder: "Partner weight minimum cannot be greater than maximum.",
  },
} as const;

function localizeHardMatchSaveError(
  message: string,
  locale: SupportedLocale,
) {
  const copy = HARD_MATCH_FORM_ERROR_COPY[locale];
  if (message === HARD_MATCH_FORM_ERROR_COPY["zh-CN"].incomplete) {
    return copy.incomplete;
  }
  if (message === HARD_MATCH_FORM_ERROR_COPY["zh-CN"].multiRequired) {
    return copy.multiRequired;
  }
  if (message === HARD_MATCH_FORM_ERROR_COPY["zh-CN"].introRequired) {
    return copy.introRequired;
  }
  if (
    message ===
    HARD_MATCH_FORM_ERROR_COPY["zh-CN"].introTooLong(
      HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH,
    )
  ) {
    return copy.introTooLong(HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH);
  }
  if (message === HARD_MATCH_FORM_ERROR_COPY["zh-CN"].ageRange) {
    return copy.ageRange;
  }
  if (message === HARD_MATCH_FORM_ERROR_COPY["zh-CN"].heightRange) {
    return copy.heightRange;
  }
  if (message === HARD_MATCH_FORM_ERROR_COPY["zh-CN"].ownWeightRange) {
    return copy.ownWeightRange;
  }
  if (message === HARD_MATCH_FORM_ERROR_COPY["zh-CN"].partnerWeightRange) {
    return copy.partnerWeightRange;
  }
  if (message === HARD_MATCH_FORM_ERROR_COPY["zh-CN"].partnerWeightOrder) {
    return copy.partnerWeightOrder;
  }
  return message;
}

/** Returns a user-facing message when hard-match fields fail save validation; otherwise null. */
export function getHardMatchFormSaveErrorMessage(
  formState: HardMatchFormState,
  locale: SupportedLocale = "zh-CN",
): string | null {
  try {
    buildHardMatchAnswerRecord(formState);
    return null;
  } catch (error) {
    return error instanceof Error
      ? localizeHardMatchSaveError(error.message, locale)
      : HARD_MATCH_FORM_ERROR_COPY[locale].incomplete;
  }
}

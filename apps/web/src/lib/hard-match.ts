import {
  AGE_OPTIONS,
  BIRTH_YEAR_OPTIONS,
  HARD_MATCH_FORM_HEIGHT_MAX_CM,
  HARD_MATCH_GENDERS,
  HARD_MATCH_HEIGHT_MIN_CM,
  HARD_MATCH_KEYS,
  HARD_MATCH_LOOKS,
  HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH,
  HEIGHT_OPTIONS,
  MONTH_OPTIONS,
  buildDayOptions,
  normalizeOneLinerIntro,
  readHeightValue,
  readSingleChoice,
  readStringArray,
  splitBirthDate,
} from "@lilink/shared";

export {
  AGE_OPTIONS,
  BIRTH_YEAR_OPTIONS,
  HARD_MATCH_GENDERS,
  HARD_MATCH_KEYS,
  HARD_MATCH_LOOKS,
  HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH,
  HEIGHT_OPTIONS,
  MONTH_OPTIONS,
  buildDayOptions,
};

export type HardMatchFormState = {
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  partnerAgeMin: string;
  partnerAgeMax: string;
  gender: string;
  partnerGenders: string[];
  looks: string;
  partnerLooks: string[];
  heightCm: string;
  partnerHeightMin: string;
  partnerHeightMax: string;
  oneLinerIntro: string;
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
    looks: "",
    partnerLooks: [],
    heightCm: "",
    partnerHeightMin: String(HARD_MATCH_HEIGHT_MIN_CM),
    partnerHeightMax: String(HARD_MATCH_FORM_HEIGHT_MAX_CM),
    oneLinerIntro: "",
  };
}

export function hardMatchFormFromAnswers(
  savedAnswers: Record<string, unknown> | undefined,
): HardMatchFormState {
  const birthDate = splitBirthDate(savedAnswers?.[HARD_MATCH_KEYS.birthDate]);

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
    gender: readSingleChoice(
      savedAnswers?.[HARD_MATCH_KEYS.gender],
      HARD_MATCH_GENDERS,
    ) ?? "",
    partnerGenders: readStringArray(
      savedAnswers?.[HARD_MATCH_KEYS.partnerGenders],
      HARD_MATCH_GENDERS,
    ),
    looks: readSingleChoice(
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
    oneLinerIntro: normalizeOneLinerIntro(
      savedAnswers?.[HARD_MATCH_KEYS.oneLinerIntro],
    ),
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

export function buildHardMatchAnswerRecord(formState: HardMatchFormState) {
  if (
    !formState.birthYear ||
    !formState.birthMonth ||
    !formState.birthDay ||
    !formState.gender ||
    !formState.looks ||
    !formState.heightCm
  ) {
    throw new Error("请先完成所有硬性条件题目。");
  }

  if (
    formState.partnerGenders.length === 0 ||
    formState.partnerLooks.length === 0
  ) {
    throw new Error("希望对方的条件为多选题，至少要选一项。");
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

  const birthDate = `${formState.birthYear}-${formState.birthMonth.padStart(2, "0")}-${formState.birthDay.padStart(2, "0")}`;

  return {
    [HARD_MATCH_KEYS.birthDate]: birthDate,
    [HARD_MATCH_KEYS.partnerAgeMin]: partnerAgeMin,
    [HARD_MATCH_KEYS.partnerAgeMax]: partnerAgeMax,
    [HARD_MATCH_KEYS.gender]: formState.gender,
    [HARD_MATCH_KEYS.partnerGenders]: formState.partnerGenders,
    [HARD_MATCH_KEYS.looks]: formState.looks,
    [HARD_MATCH_KEYS.partnerLooks]: formState.partnerLooks,
    [HARD_MATCH_KEYS.heightCm]: heightCm,
    [HARD_MATCH_KEYS.partnerHeightMin]: partnerHeightMin,
    [HARD_MATCH_KEYS.partnerHeightMax]: partnerHeightMax,
    [HARD_MATCH_KEYS.oneLinerIntro]: oneLinerIntro,
  };
}

/** Returns a user-facing message when hard-match fields fail save validation; otherwise null. */
export function getHardMatchFormSaveErrorMessage(
  formState: HardMatchFormState,
): string | null {
  try {
    buildHardMatchAnswerRecord(formState);
    return null;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "请先完成所有硬性条件题目。";
  }
}

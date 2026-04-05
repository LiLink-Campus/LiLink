export const HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH = 200;

export const HARD_MATCH_KEYS = {
  birthDate: "hard_birth_date",
  partnerAgeMin: "hard_partner_age_min",
  partnerAgeMax: "hard_partner_age_max",
  gender: "hard_gender",
  partnerGenders: "hard_partner_genders",
  looks: "hard_looks",
  partnerLooks: "hard_partner_looks",
  heightCm: "hard_height_cm",
  partnerHeightMin: "hard_partner_height_min",
  partnerHeightMax: "hard_partner_height_max",
  oneLinerIntro: "hard_one_liner_intro",
} as const;

export const HARD_MATCH_GENDERS = ["男", "女", "非二元"] as const;
export const HARD_MATCH_LOOKS = ["普通人", "小帅/美", "顶帅/美"] as const;

export const HEIGHT_CM_MIN = 120;
export const HEIGHT_CM_MAX = 220;
export const HEIGHT_OPTIONS = Array.from(
  { length: HEIGHT_CM_MAX - HEIGHT_CM_MIN + 1 },
  (_, i) => i + HEIGHT_CM_MIN,
);

export const AGE_OPTIONS = Array.from({ length: 100 }, (_, index) => index + 1);
export const MONTH_OPTIONS = Array.from(
  { length: 12 },
  (_, index) => index + 1,
);

const currentYear = new Date().getFullYear();

export const BIRTH_YEAR_OPTIONS = Array.from(
  { length: 100 },
  (_, index) => currentYear - index - 1,
);

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
    partnerHeightMin: String(HEIGHT_CM_MIN),
    partnerHeightMax: String(HEIGHT_CM_MAX),
    oneLinerIntro: "",
  };
}

export function buildDayOptions(year: string, month: string) {
  const numericYear = Number(year);
  const numericMonth = Number(month);

  if (!Number.isInteger(numericYear) || !Number.isInteger(numericMonth)) {
    return Array.from({ length: 31 }, (_, index) => index + 1);
  }

  const daysInMonth = new Date(numericYear, numericMonth, 0).getDate();
  return Array.from({ length: daysInMonth }, (_, index) => index + 1);
}

function splitBirthDate(value: unknown) {
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

function readStringArray(value: unknown, allowedValues: readonly string[]) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => allowedValues.includes(item)),
    ),
  ];
}

function readSingleChoice(
  value: unknown,
  allowedValues: readonly string[],
): string {
  if (typeof value !== "string") {
    return "";
  }

  const normalizedValue = value.trim();
  return allowedValues.includes(normalizedValue) ? normalizedValue : "";
}

function readHeightValue(value: unknown, fallback = ""): string {
  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value);
  }
  return fallback;
}

function readOneLinerIntro(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, " ");
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
    ),
    partnerGenders: readStringArray(
      savedAnswers?.[HARD_MATCH_KEYS.partnerGenders],
      HARD_MATCH_GENDERS,
    ),
    looks: readSingleChoice(
      savedAnswers?.[HARD_MATCH_KEYS.looks],
      HARD_MATCH_LOOKS,
    ),
    partnerLooks: readStringArray(
      savedAnswers?.[HARD_MATCH_KEYS.partnerLooks],
      HARD_MATCH_LOOKS,
    ),
    heightCm: readHeightValue(savedAnswers?.[HARD_MATCH_KEYS.heightCm]),
    partnerHeightMin: readHeightValue(
      savedAnswers?.[HARD_MATCH_KEYS.partnerHeightMin],
      String(HEIGHT_CM_MIN),
    ),
    partnerHeightMax: readHeightValue(
      savedAnswers?.[HARD_MATCH_KEYS.partnerHeightMax],
      String(HEIGHT_CM_MAX),
    ),
    oneLinerIntro: readOneLinerIntro(savedAnswers?.[HARD_MATCH_KEYS.oneLinerIntro]),
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

/**
 * @param oneLinerIntroSource Questionnaire still stores `hard_one_liner_intro`; the dashboard
 * collects a single nickname field and passes it here so backend validation stays unchanged.
 */
export function buildHardMatchAnswerRecord(
  formState: HardMatchFormState,
  oneLinerIntroSource: string,
) {
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

  const oneLinerIntro = oneLinerIntroSource.trim().replace(/\s+/g, " ");
  if (!oneLinerIntro) {
    throw new Error("请填写昵称。");
  }

  if (oneLinerIntro.length > HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH) {
    throw new Error(`昵称请不要超过 ${HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH} 字。`);
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
  oneLinerIntroSource: string,
): string | null {
  try {
    buildHardMatchAnswerRecord(formState, oneLinerIntroSource);
    return null;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : "请先完成所有硬性条件题目。";
  }
}

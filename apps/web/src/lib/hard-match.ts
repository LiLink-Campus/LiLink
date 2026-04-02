export const HARD_MATCH_KEYS = {
  birthDate: "hard_birth_date",
  partnerAgeMin: "hard_partner_age_min",
  partnerAgeMax: "hard_partner_age_max",
  gender: "hard_gender",
  partnerGenders: "hard_partner_genders",
  looks: "hard_looks",
  partnerLooks: "hard_partner_looks",
  race: "hard_race",
  partnerRaces: "hard_partner_races",
} as const;

export const HARD_MATCH_GENDERS = ["男", "女", "非二元"] as const;
export const HARD_MATCH_LOOKS = ["普通人", "小帅/美", "顶帅/美"] as const;
export const HARD_MATCH_RACES = ["黄种人", "黑种人", "白种人"] as const;

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
  race: string;
  partnerRaces: string[];
};

export function createEmptyHardMatchForm(): HardMatchFormState {
  return {
    birthYear: "",
    birthMonth: "",
    birthDay: "",
    partnerAgeMin: "1",
    partnerAgeMax: "100",
    gender: "",
    partnerGenders: [...HARD_MATCH_GENDERS],
    looks: "",
    partnerLooks: [...HARD_MATCH_LOOKS],
    race: "",
    partnerRaces: [...HARD_MATCH_RACES],
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
    return [...allowedValues];
  }

  const normalizedValues = [
    ...new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item) => allowedValues.includes(item)),
    ),
  ];

  return normalizedValues.length > 0 ? normalizedValues : [...allowedValues];
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
    race: readSingleChoice(savedAnswers?.[HARD_MATCH_KEYS.race], HARD_MATCH_RACES),
    partnerRaces: readStringArray(
      savedAnswers?.[HARD_MATCH_KEYS.partnerRaces],
      HARD_MATCH_RACES,
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
    !formState.race
  ) {
    throw new Error("请先完成所有硬性条件题目。");
  }

  if (
    formState.partnerGenders.length === 0 ||
    formState.partnerLooks.length === 0 ||
    formState.partnerRaces.length === 0
  ) {
    throw new Error("希望对方的条件为多选题，至少要选一项。");
  }

  const partnerAgeMin = Number(formState.partnerAgeMin);
  const partnerAgeMax = Number(formState.partnerAgeMax);

  if (partnerAgeMin > partnerAgeMax) {
    throw new Error("希望对方年龄下限不能大于上限。");
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
    [HARD_MATCH_KEYS.race]: formState.race,
    [HARD_MATCH_KEYS.partnerRaces]: formState.partnerRaces,
  };
}

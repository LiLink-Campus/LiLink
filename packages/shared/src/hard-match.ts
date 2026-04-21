export const HARD_MATCH_GENDERS = ["男", "女", "非二元"] as const;
export const HARD_MATCH_LOOKS = ["普通人", "小帅/美", "顶帅/美"] as const;

export const HARD_MATCH_HEIGHT_MIN_CM = 120;
export const HARD_MATCH_HEIGHT_MAX_CM = 230;
export const HARD_MATCH_FORM_HEIGHT_MAX_CM = 220;
export const HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH = 200;
export const HARD_MATCH_AGE_MIN = 1;
export const HARD_MATCH_AGE_MAX = 100;

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
  school: "hard_school",
  excludedPartnerSchools: "hard_excluded_partner_schools",
  excludedPartnerSchoolGenders: "hard_excluded_partner_school_genders",
} as const;

export type HardMatchGender = (typeof HARD_MATCH_GENDERS)[number];
export type HardMatchLooks = (typeof HARD_MATCH_LOOKS)[number];
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
  looks: HardMatchLooks;
  partnerLooks: HardMatchLooks[];
  heightCm: number;
  partnerHeightMin: number;
  partnerHeightMax: number;
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

  for (const schoolId of readTrimmedStringArray(rawValues.excludedPartnerSchools)) {
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
        partialSchoolGenderSelections.get(schoolId) ?? new Set<HardMatchGender>();
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

  const excludedPartnerSchoolGenders = [...partialSchoolGenderSelections.entries()]
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

export function readIntegerInRange(
  value: unknown,
  min: number,
  max: number,
) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return null;
  }

  if (value < min || value > max) {
    return null;
  }

  return value;
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
    looks == null ||
    school == null
  ) {
    return null;
  }

  if (partnerAgeMin > partnerAgeMax || partnerHeightMin > partnerHeightMax) {
    return null;
  }

  if (partnerGenders.length === 0 || partnerLooks.length === 0) {
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
    looks,
    partnerLooks,
    heightCm,
    partnerHeightMin,
    partnerHeightMax,
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

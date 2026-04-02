import { BadRequestException } from '@nestjs/common';

export const HARD_MATCH_GENDERS = ['男', '女', '非二元'] as const;
export const HARD_MATCH_LOOKS = ['普通人', '小帅/美', '顶帅/美'] as const;
export const HARD_MATCH_RACES = ['黄种人', '黑种人', '白种人'] as const;

export const HARD_MATCH_KEYS = {
  birthDate: 'hard_birth_date',
  partnerAgeMin: 'hard_partner_age_min',
  partnerAgeMax: 'hard_partner_age_max',
  gender: 'hard_gender',
  partnerGenders: 'hard_partner_genders',
  looks: 'hard_looks',
  partnerLooks: 'hard_partner_looks',
  race: 'hard_race',
  partnerRaces: 'hard_partner_races',
} as const;

const HARD_MATCH_FIELD_LABELS = {
  [HARD_MATCH_KEYS.birthDate]: '出生年月日',
  [HARD_MATCH_KEYS.partnerAgeMin]: '希望对方年龄下限',
  [HARD_MATCH_KEYS.partnerAgeMax]: '希望对方年龄上限',
  [HARD_MATCH_KEYS.gender]: '你的性别',
  [HARD_MATCH_KEYS.partnerGenders]: '希望对方的性别',
  [HARD_MATCH_KEYS.looks]: '颜值自评',
  [HARD_MATCH_KEYS.partnerLooks]: '希望对方的颜值',
  [HARD_MATCH_KEYS.race]: '你的人种',
  [HARD_MATCH_KEYS.partnerRaces]: '希望对方的人种',
} as const;

export type HardMatchGender = (typeof HARD_MATCH_GENDERS)[number];
export type HardMatchLooks = (typeof HARD_MATCH_LOOKS)[number];
export type HardMatchRace = (typeof HARD_MATCH_RACES)[number];
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
  race: HardMatchRace;
  partnerRaces: HardMatchRace[];
};

export type HardMatchAnswerRecord = {
  [HARD_MATCH_KEYS.birthDate]: string;
  [HARD_MATCH_KEYS.partnerAgeMin]: number;
  [HARD_MATCH_KEYS.partnerAgeMax]: number;
  [HARD_MATCH_KEYS.gender]: HardMatchGender;
  [HARD_MATCH_KEYS.partnerGenders]: HardMatchGender[];
  [HARD_MATCH_KEYS.looks]: HardMatchLooks;
  [HARD_MATCH_KEYS.partnerLooks]: HardMatchLooks[];
  [HARD_MATCH_KEYS.race]: HardMatchRace;
  [HARD_MATCH_KEYS.partnerRaces]: HardMatchRace[];
};

const HARD_MATCH_KEY_SET = new Set<string>(Object.values(HARD_MATCH_KEYS));

function labelFor(key: HardMatchKey) {
  return HARD_MATCH_FIELD_LABELS[key];
}

function requiredFieldError(key: HardMatchKey): BadRequestException {
  return new BadRequestException(`Question "${labelFor(key)}" is required.`);
}

function invalidFieldError(
  key: HardMatchKey,
  detail = 'contains an invalid value.',
): BadRequestException {
  return new BadRequestException(`Question "${labelFor(key)}" ${detail}`);
}

function normalizeSingleChoice<T extends string>(
  value: unknown,
  key: HardMatchKey,
  allowedValues: readonly T[],
): T {
  if (typeof value !== 'string') {
    throw requiredFieldError(key);
  }

  const normalizedValue = value.trim() as T;
  if (!normalizedValue) {
    throw requiredFieldError(key);
  }

  if (!allowedValues.includes(normalizedValue)) {
    throw invalidFieldError(key);
  }

  return normalizedValue;
}

function normalizeMultiChoice<T extends string>(
  value: unknown,
  key: HardMatchKey,
  allowedValues: readonly T[],
): T[] {
  if (!Array.isArray(value)) {
    throw requiredFieldError(key);
  }

  const normalizedValues = [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ] as T[];

  if (normalizedValues.length === 0) {
    throw requiredFieldError(key);
  }

  if (normalizedValues.some((item) => !allowedValues.includes(item))) {
    throw invalidFieldError(key);
  }

  return normalizedValues;
}

function normalizeAge(value: unknown, key: HardMatchKey): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw requiredFieldError(key);
  }

  if (value < 1 || value > 100) {
    throw invalidFieldError(key, 'must be between 1 and 100.');
  }

  return value;
}

function normalizeBirthDate(value: unknown): string {
  if (typeof value !== 'string') {
    throw requiredFieldError(HARD_MATCH_KEYS.birthDate);
  }

  const trimmedValue = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmedValue);
  if (!match) {
    throw invalidFieldError(
      HARD_MATCH_KEYS.birthDate,
      'must use the YYYY-MM-DD format.',
    );
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
    throw invalidFieldError(
      HARD_MATCH_KEYS.birthDate,
      'must be a real calendar date.',
    );
  }

  return trimmedValue;
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

function calculateAgeOnDate(birthDate: string, referenceDate: Date) {
  const [yearText, monthText, dayText] = birthDate.split('-');
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

export function isHardMatchKey(key: string): key is HardMatchKey {
  return HARD_MATCH_KEY_SET.has(key);
}

export function hardMatchQuestionKeys() {
  return [...HARD_MATCH_KEY_SET];
}

function normalizeHardMatchValues(
  rawAnswers: Record<string, unknown>,
): HardMatchAnswers {
  const partnerAgeMin = normalizeAge(
    rawAnswers[HARD_MATCH_KEYS.partnerAgeMin],
    HARD_MATCH_KEYS.partnerAgeMin,
  );
  const partnerAgeMax = normalizeAge(
    rawAnswers[HARD_MATCH_KEYS.partnerAgeMax],
    HARD_MATCH_KEYS.partnerAgeMax,
  );

  if (partnerAgeMin > partnerAgeMax) {
    throw new BadRequestException(
      `Question "${labelFor(HARD_MATCH_KEYS.partnerAgeMin)}" must be less than or equal to "${labelFor(HARD_MATCH_KEYS.partnerAgeMax)}".`,
    );
  }

  return {
    birthDate: normalizeBirthDate(rawAnswers[HARD_MATCH_KEYS.birthDate]),
    partnerAgeMin,
    partnerAgeMax,
    gender: normalizeSingleChoice(
      rawAnswers[HARD_MATCH_KEYS.gender],
      HARD_MATCH_KEYS.gender,
      HARD_MATCH_GENDERS,
    ),
    partnerGenders: normalizeMultiChoice(
      rawAnswers[HARD_MATCH_KEYS.partnerGenders],
      HARD_MATCH_KEYS.partnerGenders,
      HARD_MATCH_GENDERS,
    ),
    looks: normalizeSingleChoice(
      rawAnswers[HARD_MATCH_KEYS.looks],
      HARD_MATCH_KEYS.looks,
      HARD_MATCH_LOOKS,
    ),
    partnerLooks: normalizeMultiChoice(
      rawAnswers[HARD_MATCH_KEYS.partnerLooks],
      HARD_MATCH_KEYS.partnerLooks,
      HARD_MATCH_LOOKS,
    ),
    race: normalizeSingleChoice(
      rawAnswers[HARD_MATCH_KEYS.race],
      HARD_MATCH_KEYS.race,
      HARD_MATCH_RACES,
    ),
    partnerRaces: normalizeMultiChoice(
      rawAnswers[HARD_MATCH_KEYS.partnerRaces],
      HARD_MATCH_KEYS.partnerRaces,
      HARD_MATCH_RACES,
    ),
  };
}

export function normalizeHardMatchAnswers(
  rawAnswers: Record<string, unknown>,
): HardMatchAnswerRecord {
  const normalizedValues = normalizeHardMatchValues(rawAnswers);

  return {
    [HARD_MATCH_KEYS.birthDate]: normalizedValues.birthDate,
    [HARD_MATCH_KEYS.partnerAgeMin]: normalizedValues.partnerAgeMin,
    [HARD_MATCH_KEYS.partnerAgeMax]: normalizedValues.partnerAgeMax,
    [HARD_MATCH_KEYS.gender]: normalizedValues.gender,
    [HARD_MATCH_KEYS.partnerGenders]: normalizedValues.partnerGenders,
    [HARD_MATCH_KEYS.looks]: normalizedValues.looks,
    [HARD_MATCH_KEYS.partnerLooks]: normalizedValues.partnerLooks,
    [HARD_MATCH_KEYS.race]: normalizedValues.race,
    [HARD_MATCH_KEYS.partnerRaces]: normalizedValues.partnerRaces,
  };
}

export function tryReadHardMatchAnswers(
  rawAnswers: Record<string, unknown>,
): HardMatchAnswers | null {
  try {
    return normalizeHardMatchValues(rawAnswers);
  } catch {
    return null;
  }
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
    !multiPreferenceMatches(left.partnerRaces, right.race, HARD_MATCH_RACES) ||
    !multiPreferenceMatches(right.partnerRaces, left.race, HARD_MATCH_RACES)
  ) {
    return false;
  }

  return true;
}

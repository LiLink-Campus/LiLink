import { BadRequestException } from '@nestjs/common';
import {
  HARD_MATCH_GENDERS,
  HARD_MATCH_HEIGHT_MAX_CM,
  HARD_MATCH_HEIGHT_MIN_CM,
  HARD_MATCH_KEYS,
  HARD_MATCH_LOOKS,
  HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH,
  areHardMatchAnswersCompatible,
  hardMatchQuestionKeys,
  isHardMatchKey,
  normalizeBirthDate,
  normalizeOneLinerIntro,
  parseHardMatchAnswers,
  readIntegerInRange,
  readQuestionnaireOneLiner,
  readSingleChoice,
  readStringArray,
  type HardMatchAnswers,
  type HardMatchGender,
  type HardMatchKey,
  type HardMatchLooks,
} from '@lilink/shared';

export {
  HARD_MATCH_GENDERS,
  HARD_MATCH_HEIGHT_MAX_CM,
  HARD_MATCH_HEIGHT_MIN_CM,
  HARD_MATCH_KEYS,
  HARD_MATCH_LOOKS,
  HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH,
  areHardMatchAnswersCompatible,
  hardMatchQuestionKeys,
  isHardMatchKey,
  readQuestionnaireOneLiner,
  type HardMatchAnswers,
  type HardMatchGender,
  type HardMatchKey,
  type HardMatchLooks,
};

const HARD_MATCH_FIELD_LABELS: Record<HardMatchKey, string> = {
  [HARD_MATCH_KEYS.birthDate]: '出生年月日',
  [HARD_MATCH_KEYS.partnerAgeMin]: '希望对方年龄下限',
  [HARD_MATCH_KEYS.partnerAgeMax]: '希望对方年龄上限',
  [HARD_MATCH_KEYS.gender]: '你的性别',
  [HARD_MATCH_KEYS.partnerGenders]: '希望对方的性别',
  [HARD_MATCH_KEYS.looks]: '颜值自评',
  [HARD_MATCH_KEYS.partnerLooks]: '希望对方的颜值',
  [HARD_MATCH_KEYS.heightCm]: '身高（厘米）',
  [HARD_MATCH_KEYS.partnerHeightMin]: '希望对方身高下限（厘米）',
  [HARD_MATCH_KEYS.partnerHeightMax]: '希望对方身高上限（厘米）',
  [HARD_MATCH_KEYS.oneLinerIntro]: '一句话介绍',
};

export type HardMatchAnswerRecord = {
  [HARD_MATCH_KEYS.birthDate]: string;
  [HARD_MATCH_KEYS.partnerAgeMin]: number;
  [HARD_MATCH_KEYS.partnerAgeMax]: number;
  [HARD_MATCH_KEYS.gender]: HardMatchGender;
  [HARD_MATCH_KEYS.partnerGenders]: HardMatchGender[];
  [HARD_MATCH_KEYS.looks]: HardMatchLooks;
  [HARD_MATCH_KEYS.partnerLooks]: HardMatchLooks[];
  [HARD_MATCH_KEYS.heightCm]: number;
  [HARD_MATCH_KEYS.partnerHeightMin]: number;
  [HARD_MATCH_KEYS.partnerHeightMax]: number;
  [HARD_MATCH_KEYS.oneLinerIntro]: string;
};

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
  const normalizedValue = readSingleChoice(value, allowedValues);
  if (normalizedValue == null) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw requiredFieldError(key);
    }
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

  const normalizedValues = readStringArray(value, allowedValues);

  if (normalizedValues.length === 0) {
    throw requiredFieldError(key);
  }

  const containsInvalidValue = value.some(
    (item) =>
      typeof item !== 'string' || !allowedValues.includes(item.trim() as T),
  );
  if (containsInvalidValue) {
    throw invalidFieldError(key);
  }

  return normalizedValues;
}

function normalizeAge(value: unknown, key: HardMatchKey): number {
  const normalizedValue = readIntegerInRange(value, 1, 100);
  if (normalizedValue == null) {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw requiredFieldError(key);
    }
    throw invalidFieldError(key, 'must be between 1 and 100.');
  }

  return normalizedValue;
}

function normalizeHeight(value: unknown, key: HardMatchKey): number {
  const normalizedValue = readIntegerInRange(
    value,
    HARD_MATCH_HEIGHT_MIN_CM,
    HARD_MATCH_HEIGHT_MAX_CM,
  );
  if (normalizedValue == null) {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw requiredFieldError(key);
    }
    throw invalidFieldError(
      key,
      `must be between ${HARD_MATCH_HEIGHT_MIN_CM} and ${HARD_MATCH_HEIGHT_MAX_CM}.`,
    );
  }

  return normalizedValue;
}

function normalizeBirthDateValue(value: unknown): string {
  const normalizedValue = normalizeBirthDate(value);
  if (normalizedValue == null) {
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

    throw invalidFieldError(
      HARD_MATCH_KEYS.birthDate,
      'must be a real calendar date.',
    );
  }

  return normalizedValue;
}

function normalizeOneLinerIntroValue(
  value: unknown,
  options: { allowEmpty: boolean },
): string {
  const collapsed = normalizeOneLinerIntro(value);

  if (collapsed.length === 0) {
    if (options.allowEmpty) {
      return '';
    }
    throw requiredFieldError(HARD_MATCH_KEYS.oneLinerIntro);
  }

  if (collapsed.length > HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH) {
    throw invalidFieldError(
      HARD_MATCH_KEYS.oneLinerIntro,
      `must be at most ${HARD_MATCH_ONE_LINER_INTRO_MAX_LENGTH} characters.`,
    );
  }

  return collapsed;
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

  const heightCm = normalizeHeight(
    rawAnswers[HARD_MATCH_KEYS.heightCm],
    HARD_MATCH_KEYS.heightCm,
  );

  const partnerHeightMin = normalizeHeight(
    rawAnswers[HARD_MATCH_KEYS.partnerHeightMin],
    HARD_MATCH_KEYS.partnerHeightMin,
  );
  const partnerHeightMax = normalizeHeight(
    rawAnswers[HARD_MATCH_KEYS.partnerHeightMax],
    HARD_MATCH_KEYS.partnerHeightMax,
  );

  if (partnerHeightMin > partnerHeightMax) {
    throw new BadRequestException(
      `Question "${labelFor(HARD_MATCH_KEYS.partnerHeightMin)}" must be less than or equal to "${labelFor(HARD_MATCH_KEYS.partnerHeightMax)}".`,
    );
  }

  return {
    birthDate: normalizeBirthDateValue(rawAnswers[HARD_MATCH_KEYS.birthDate]),
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
    heightCm,
    partnerHeightMin,
    partnerHeightMax,
    oneLinerIntro: normalizeOneLinerIntroValue(
      rawAnswers[HARD_MATCH_KEYS.oneLinerIntro],
      { allowEmpty: true },
    ),
  };
}

export function normalizeHardMatchAnswers(
  rawAnswers: Record<string, unknown>,
): HardMatchAnswerRecord {
  const normalizedValues = normalizeHardMatchValues(rawAnswers);

  if (!normalizedValues.oneLinerIntro) {
    throw requiredFieldError(HARD_MATCH_KEYS.oneLinerIntro);
  }

  return {
    [HARD_MATCH_KEYS.birthDate]: normalizedValues.birthDate,
    [HARD_MATCH_KEYS.partnerAgeMin]: normalizedValues.partnerAgeMin,
    [HARD_MATCH_KEYS.partnerAgeMax]: normalizedValues.partnerAgeMax,
    [HARD_MATCH_KEYS.gender]: normalizedValues.gender,
    [HARD_MATCH_KEYS.partnerGenders]: normalizedValues.partnerGenders,
    [HARD_MATCH_KEYS.looks]: normalizedValues.looks,
    [HARD_MATCH_KEYS.partnerLooks]: normalizedValues.partnerLooks,
    [HARD_MATCH_KEYS.heightCm]: normalizedValues.heightCm,
    [HARD_MATCH_KEYS.partnerHeightMin]: normalizedValues.partnerHeightMin,
    [HARD_MATCH_KEYS.partnerHeightMax]: normalizedValues.partnerHeightMax,
    [HARD_MATCH_KEYS.oneLinerIntro]: normalizedValues.oneLinerIntro,
  };
}

export function tryReadHardMatchAnswers(
  rawAnswers: Record<string, unknown>,
): HardMatchAnswers | null {
  return parseHardMatchAnswers(rawAnswers);
}

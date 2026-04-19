import { BadRequestException } from '@nestjs/common';
import {
  HARD_MATCH_AGE_MAX,
  HARD_MATCH_AGE_MIN,
  HARD_MATCH_GENDERS,
  HARD_MATCH_FORM_HEIGHT_MAX_CM,
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
  type HardMatchSchoolId,
} from '@lilink/shared';
import { IncompleteQuestionnaireSubmissionException } from './incomplete-questionnaire-submission.exception';

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
  type HardMatchSchoolId,
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
  [HARD_MATCH_KEYS.school]: '你的学校',
  [HARD_MATCH_KEYS.excludedPartnerSchools]: '不希望对方的学校',
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
  [HARD_MATCH_KEYS.school]: HardMatchSchoolId;
  [HARD_MATCH_KEYS.excludedPartnerSchools]: HardMatchSchoolId[];
};

export type HardMatchDraftForm = {
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
  excludedPartnerSchools: string[];
};

export function createEmptyHardMatchDraftForm(): HardMatchDraftForm {
  return {
    birthYear: '',
    birthMonth: '',
    birthDay: '',
    partnerAgeMin: String(HARD_MATCH_AGE_MIN),
    partnerAgeMax: String(HARD_MATCH_AGE_MAX),
    gender: '',
    partnerGenders: [],
    looks: '',
    partnerLooks: [],
    heightCm: '',
    partnerHeightMin: String(HARD_MATCH_HEIGHT_MIN_CM),
    partnerHeightMax: String(HARD_MATCH_FORM_HEIGHT_MAX_CM),
    oneLinerIntro: '',
    excludedPartnerSchools: [],
  };
}

function readDigits(value: unknown, maxLength: number) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0 || trimmedValue.length > maxLength) {
    return '';
  }

  return /^\d+$/.test(trimmedValue) ? trimmedValue : '';
}

function readAllowedString(
  value: unknown,
  allowedValues: readonly string[],
): string {
  return readSingleChoice(value, allowedValues) ?? '';
}

function readAllowedNumberString(
  value: unknown,
  minimumValue: number,
  maximumValue: number,
  fallbackValue: string,
) {
  if (typeof value !== 'string') {
    return fallbackValue;
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return fallbackValue;
  }

  const normalizedValue = readIntegerInRange(
    Number.parseInt(trimmedValue, 10),
    minimumValue,
    maximumValue,
  );

  return normalizedValue == null ? fallbackValue : String(normalizedValue);
}

export function sanitizeHardMatchDraftForm(
  rawForm: unknown,
  allowedSchoolIds: readonly string[],
): HardMatchDraftForm {
  if (!rawForm || typeof rawForm !== 'object' || Array.isArray(rawForm)) {
    return createEmptyHardMatchDraftForm();
  }

  const form = rawForm as Record<string, unknown>;

  return {
    birthYear: readDigits(form.birthYear, 4),
    birthMonth: readDigits(form.birthMonth, 2),
    birthDay: readDigits(form.birthDay, 2),
    partnerAgeMin: readAllowedNumberString(
      form.partnerAgeMin,
      HARD_MATCH_AGE_MIN,
      HARD_MATCH_AGE_MAX,
      String(HARD_MATCH_AGE_MIN),
    ),
    partnerAgeMax: readAllowedNumberString(
      form.partnerAgeMax,
      HARD_MATCH_AGE_MIN,
      HARD_MATCH_AGE_MAX,
      String(HARD_MATCH_AGE_MAX),
    ),
    gender: readAllowedString(form.gender, HARD_MATCH_GENDERS),
    partnerGenders: readStringArray(form.partnerGenders, HARD_MATCH_GENDERS),
    looks: readAllowedString(form.looks, HARD_MATCH_LOOKS),
    partnerLooks: readStringArray(form.partnerLooks, HARD_MATCH_LOOKS),
    heightCm: readAllowedNumberString(
      form.heightCm,
      HARD_MATCH_HEIGHT_MIN_CM,
      HARD_MATCH_HEIGHT_MAX_CM,
      '',
    ),
    partnerHeightMin: readAllowedNumberString(
      form.partnerHeightMin,
      HARD_MATCH_HEIGHT_MIN_CM,
      HARD_MATCH_HEIGHT_MAX_CM,
      String(HARD_MATCH_HEIGHT_MIN_CM),
    ),
    partnerHeightMax: readAllowedNumberString(
      form.partnerHeightMax,
      HARD_MATCH_HEIGHT_MIN_CM,
      HARD_MATCH_HEIGHT_MAX_CM,
      String(HARD_MATCH_FORM_HEIGHT_MAX_CM),
    ),
    oneLinerIntro: normalizeOneLinerIntro(form.oneLinerIntro),
    excludedPartnerSchools: readStringArray(
      form.excludedPartnerSchools,
      allowedSchoolIds,
    ),
  };
}

export function buildHardMatchAnswerRecordFromDraftForm(
  form: HardMatchDraftForm,
  schoolId: string,
  allowedSchoolIds: readonly string[],
) {
  const rawAnswers: Record<string, unknown> = {
    [HARD_MATCH_KEYS.partnerAgeMin]: Number(form.partnerAgeMin),
    [HARD_MATCH_KEYS.partnerAgeMax]: Number(form.partnerAgeMax),
    [HARD_MATCH_KEYS.gender]: form.gender,
    [HARD_MATCH_KEYS.partnerGenders]: form.partnerGenders,
    [HARD_MATCH_KEYS.looks]: form.looks,
    [HARD_MATCH_KEYS.partnerLooks]: form.partnerLooks,
    [HARD_MATCH_KEYS.heightCm]: Number(form.heightCm),
    [HARD_MATCH_KEYS.partnerHeightMin]: Number(form.partnerHeightMin),
    [HARD_MATCH_KEYS.partnerHeightMax]: Number(form.partnerHeightMax),
    [HARD_MATCH_KEYS.oneLinerIntro]: form.oneLinerIntro,
    [HARD_MATCH_KEYS.school]: schoolId,
    [HARD_MATCH_KEYS.excludedPartnerSchools]: form.excludedPartnerSchools,
  };

  if (form.birthYear && form.birthMonth && form.birthDay) {
    rawAnswers[HARD_MATCH_KEYS.birthDate] =
      `${form.birthYear}-${form.birthMonth.padStart(2, '0')}-${form.birthDay.padStart(2, '0')}`;
  }

  return normalizeHardMatchAnswers(rawAnswers, allowedSchoolIds);
}

function readRequiredIntegerInput(value: unknown, key: HardMatchKey): number {
  if (typeof value !== 'string') {
    throw requiredFieldError(key);
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    throw requiredFieldError(key);
  }

  if (!/^\d+$/.test(trimmedValue)) {
    throw invalidFieldError(key);
  }

  return Number.parseInt(trimmedValue, 10);
}

function readRequiredBirthDatePart(
  value: unknown,
  maximumLength: number,
): string {
  if (typeof value !== 'string') {
    throw requiredFieldError(HARD_MATCH_KEYS.birthDate);
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    throw requiredFieldError(HARD_MATCH_KEYS.birthDate);
  }

  if (trimmedValue.length > maximumLength || !/^\d+$/.test(trimmedValue)) {
    throw invalidFieldError(
      HARD_MATCH_KEYS.birthDate,
      'must use the YYYY-MM-DD format.',
    );
  }

  return trimmedValue;
}

export function buildHardMatchAnswerRecordFromFormInput(
  rawForm: unknown,
  schoolId: string,
  allowedSchoolIds: readonly string[],
) {
  if (!rawForm || typeof rawForm !== 'object' || Array.isArray(rawForm)) {
    throw requiredFieldError(HARD_MATCH_KEYS.birthDate);
  }

  const form = rawForm as Record<string, unknown>;
  const birthYear = readRequiredBirthDatePart(form.birthYear, 4);
  const birthMonth = readRequiredBirthDatePart(form.birthMonth, 2);
  const birthDay = readRequiredBirthDatePart(form.birthDay, 2);

  return normalizeHardMatchAnswers(
    {
      [HARD_MATCH_KEYS.birthDate]: `${birthYear}-${birthMonth.padStart(2, '0')}-${birthDay.padStart(2, '0')}`,
      [HARD_MATCH_KEYS.partnerAgeMin]: readRequiredIntegerInput(
        form.partnerAgeMin,
        HARD_MATCH_KEYS.partnerAgeMin,
      ),
      [HARD_MATCH_KEYS.partnerAgeMax]: readRequiredIntegerInput(
        form.partnerAgeMax,
        HARD_MATCH_KEYS.partnerAgeMax,
      ),
      [HARD_MATCH_KEYS.gender]: form.gender,
      [HARD_MATCH_KEYS.partnerGenders]: form.partnerGenders,
      [HARD_MATCH_KEYS.looks]: form.looks,
      [HARD_MATCH_KEYS.partnerLooks]: form.partnerLooks,
      [HARD_MATCH_KEYS.heightCm]: readRequiredIntegerInput(
        form.heightCm,
        HARD_MATCH_KEYS.heightCm,
      ),
      [HARD_MATCH_KEYS.partnerHeightMin]: readRequiredIntegerInput(
        form.partnerHeightMin,
        HARD_MATCH_KEYS.partnerHeightMin,
      ),
      [HARD_MATCH_KEYS.partnerHeightMax]: readRequiredIntegerInput(
        form.partnerHeightMax,
        HARD_MATCH_KEYS.partnerHeightMax,
      ),
      [HARD_MATCH_KEYS.oneLinerIntro]: form.oneLinerIntro,
      [HARD_MATCH_KEYS.school]: schoolId,
      [HARD_MATCH_KEYS.excludedPartnerSchools]: form.excludedPartnerSchools,
    },
    allowedSchoolIds,
  );
}

function labelFor(key: HardMatchKey) {
  return HARD_MATCH_FIELD_LABELS[key];
}

function requiredFieldError(key: HardMatchKey): BadRequestException {
  return new IncompleteQuestionnaireSubmissionException(
    `Question "${labelFor(key)}" is required.`,
  );
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

function normalizeOptionalMultiChoice<T extends string>(
  value: unknown,
  key: HardMatchKey,
  allowedValues: readonly T[],
): T[] {
  if (value == null || (Array.isArray(value) && value.length === 0)) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw invalidFieldError(key);
  }

  const containsInvalidValue = value.some(
    (item) =>
      typeof item !== 'string' || !allowedValues.includes(item.trim() as T),
  );
  if (containsInvalidValue) {
    throw invalidFieldError(key);
  }

  return readStringArray(value, allowedValues);
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
  allowedSchoolIds: readonly string[],
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
    school: normalizeSingleChoice(
      rawAnswers[HARD_MATCH_KEYS.school],
      HARD_MATCH_KEYS.school,
      allowedSchoolIds,
    ),
    excludedPartnerSchools: normalizeOptionalMultiChoice(
      rawAnswers[HARD_MATCH_KEYS.excludedPartnerSchools],
      HARD_MATCH_KEYS.excludedPartnerSchools,
      allowedSchoolIds,
    ),
  };
}

export function normalizeHardMatchAnswers(
  rawAnswers: Record<string, unknown>,
  allowedSchoolIds: readonly string[],
): HardMatchAnswerRecord {
  const normalizedValues = normalizeHardMatchValues(
    rawAnswers,
    allowedSchoolIds,
  );

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
    [HARD_MATCH_KEYS.school]: normalizedValues.school,
    [HARD_MATCH_KEYS.excludedPartnerSchools]:
      normalizedValues.excludedPartnerSchools,
  };
}

export function tryReadHardMatchAnswers(
  rawAnswers: Record<string, unknown>,
): HardMatchAnswers | null {
  return parseHardMatchAnswers(rawAnswers);
}

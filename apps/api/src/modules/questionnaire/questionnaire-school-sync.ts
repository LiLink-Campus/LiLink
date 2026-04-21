import type { Prisma } from '@prisma/client';
import {
  HARD_MATCH_KEYS,
  normalizeExcludedPartnerPreferences,
  readTrimmedStringArray,
} from '@lilink/shared';

type QuestionnaireAnswers = Record<string, unknown>;

type SyncQuestionnaireSchoolAnswersOptions = {
  currentSchoolId: string | null;
  allowedSchoolIds: readonly string[];
  rewrittenSchoolIds?: Readonly<Record<string, string | null>>;
};

function rewriteSchoolId(
  schoolId: string,
  rewrittenSchoolIds?: Readonly<Record<string, string | null>>,
) {
  return rewrittenSchoolIds?.[schoolId] ?? schoolId;
}

export function syncQuestionnaireSchoolAnswers(
  rawAnswers: QuestionnaireAnswers,
  options: SyncQuestionnaireSchoolAnswersOptions,
): Record<string, Prisma.InputJsonValue> {
  const nextAnswers = {
    ...(rawAnswers as Record<string, Prisma.InputJsonValue>),
  };
  const allowedSchoolIds = new Set(options.allowedSchoolIds);
  const hasExcludedPartnerSchools = Object.prototype.hasOwnProperty.call(
    rawAnswers,
    HARD_MATCH_KEYS.excludedPartnerSchools,
  );
  const hasExcludedPartnerSchoolGenders = Object.prototype.hasOwnProperty.call(
    rawAnswers,
    HARD_MATCH_KEYS.excludedPartnerSchoolGenders,
  );

  if (
    options.currentSchoolId &&
    allowedSchoolIds.has(options.currentSchoolId)
  ) {
    nextAnswers[HARD_MATCH_KEYS.school] = options.currentSchoolId;
  } else {
    delete nextAnswers[HARD_MATCH_KEYS.school];
  }

  const excludedPartnerSchools = readTrimmedStringArray(
    rawAnswers[HARD_MATCH_KEYS.excludedPartnerSchools],
  )
    .map((schoolId) => rewriteSchoolId(schoolId, options.rewrittenSchoolIds))
    .filter(Boolean);
  const rawExcludedPartnerSchoolGenders =
    rawAnswers[HARD_MATCH_KEYS.excludedPartnerSchoolGenders];

  const rewrittenExcludedPartnerSchoolGenders = Array.isArray(
    rawExcludedPartnerSchoolGenders,
  )
    ? rawExcludedPartnerSchoolGenders.map((item: unknown) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return item;
        }

        const record = item as Record<string, unknown>;
        const schoolId =
          typeof record.schoolId === 'string'
            ? rewriteSchoolId(record.schoolId, options.rewrittenSchoolIds)
            : record.schoolId;

        return {
          ...record,
          schoolId,
        };
      })
    : rawExcludedPartnerSchoolGenders;

  const excludedPartnerPreferences = normalizeExcludedPartnerPreferences(
    {
      excludedPartnerSchools,
      excludedPartnerSchoolGenders: rewrittenExcludedPartnerSchoolGenders,
    },
    options.allowedSchoolIds,
  );

  if (
    excludedPartnerPreferences.excludedPartnerSchools.length > 0 ||
    hasExcludedPartnerSchools
  ) {
    nextAnswers[HARD_MATCH_KEYS.excludedPartnerSchools] =
      excludedPartnerPreferences.excludedPartnerSchools;
  } else {
    delete nextAnswers[HARD_MATCH_KEYS.excludedPartnerSchools];
  }

  if (
    excludedPartnerPreferences.excludedPartnerSchoolGenders.length > 0 ||
    hasExcludedPartnerSchoolGenders
  ) {
    nextAnswers[HARD_MATCH_KEYS.excludedPartnerSchoolGenders] =
      excludedPartnerPreferences.excludedPartnerSchoolGenders as Prisma.InputJsonValue;
  } else {
    delete nextAnswers[HARD_MATCH_KEYS.excludedPartnerSchoolGenders];
  }

  return nextAnswers;
}

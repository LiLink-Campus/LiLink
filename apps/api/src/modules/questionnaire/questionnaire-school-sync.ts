import type { Prisma } from '@prisma/client';
import { HARD_MATCH_KEYS, readTrimmedStringArray } from '@lilink/shared';

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
    .filter(
      (schoolId): schoolId is string =>
        Boolean(schoolId) && allowedSchoolIds.has(schoolId),
    );
  const dedupedExcludedPartnerSchools = [...new Set(excludedPartnerSchools)];

  if (dedupedExcludedPartnerSchools.length > 0 || hasExcludedPartnerSchools) {
    nextAnswers[HARD_MATCH_KEYS.excludedPartnerSchools] =
      dedupedExcludedPartnerSchools;
  } else {
    delete nextAnswers[HARD_MATCH_KEYS.excludedPartnerSchools];
  }

  return nextAnswers;
}

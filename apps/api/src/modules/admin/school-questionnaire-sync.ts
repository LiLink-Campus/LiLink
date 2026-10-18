import { isDeepStrictEqual } from 'node:util';
import { Prisma } from '../../common/prisma/client';
import {
  syncExcludedPartnerSchoolPreferences,
  syncQuestionnaireSchoolAnswers,
} from '../questionnaire/questionnaire-school-sync';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function syncSchoolQuestionnaireResponses(
  tx: Prisma.TransactionClient,
  options: {
    allowedSchoolIds: readonly string[];
    rewrittenSchoolIds?: Readonly<Record<string, string | null>>;
    affectedUserIds?: readonly string[];
  },
) {
  const responseIds = await findResponsesReferencingSchools(
    tx,
    Object.keys(options.rewrittenSchoolIds ?? {}),
    options.affectedUserIds ?? [],
  );

  if (responseIds.length === 0) {
    return;
  }

  const responses = await tx.questionnaireResponse.findMany({
    where: { id: { in: responseIds } },
    select: {
      id: true,
      answers: true,
      draftAnswers: true,
      user: {
        select: {
          schoolId: true,
        },
      },
    },
  });

  for (const response of responses) {
    const rawAnswers = response.answers as Record<string, unknown>;
    const syncedAnswers = syncQuestionnaireSchoolAnswers(rawAnswers, {
      currentSchoolId: response.user.schoolId ?? null,
      allowedSchoolIds: options.allowedSchoolIds,
      rewrittenSchoolIds: options.rewrittenSchoolIds,
    });
    const syncedDraftAnswers = syncQuestionnaireDraftAnswers(
      response.draftAnswers,
      options,
    );

    if (
      isDeepStrictEqual(rawAnswers, syncedAnswers) &&
      isDeepStrictEqual(response.draftAnswers, syncedDraftAnswers)
    ) {
      continue;
    }

    const data: Record<string, Prisma.InputJsonValue> = {};
    if (!isDeepStrictEqual(rawAnswers, syncedAnswers)) {
      data.answers = syncedAnswers;
    }
    if (!isDeepStrictEqual(response.draftAnswers, syncedDraftAnswers)) {
      data.draftAnswers = syncedDraftAnswers as Prisma.InputJsonValue;
    }

    await tx.questionnaireResponse.update({
      where: { id: response.id },
      data,
    });
  }
}

/**
 * A response can only change if its answers/draftAnswers reference one of the
 * affected school ids — either as the user's own `hard_school` value or inside
 * the partner-school exclusion lists. School ids are opaque cuids, so a
 * substring match over the serialized JSON is a strict superset of the rows
 * the rewrite below can touch (the per-row recompute still decides the actual
 * change), letting Postgres filter instead of streaming every response into
 * the app. `affectedUserIds` is unioned in because a moved user's own
 * `hard_school` is rewritten to their new school even when the old value is
 * absent from the JSON. Falls back to a full scan if no rewrite mapping is
 * supplied.
 */
async function findResponsesReferencingSchools(
  tx: Prisma.TransactionClient,
  schoolIds: readonly string[],
  affectedUserIds: readonly string[],
): Promise<string[]> {
  if (schoolIds.length === 0) {
    const all = await tx.questionnaireResponse.findMany({
      select: { id: true },
    });
    return all.map((response) => response.id);
  }

  const conditions = [...new Set(schoolIds)].map(
    (schoolId) => Prisma.sql`(
      strpos("answers"::text, ${schoolId}) > 0
      OR strpos(COALESCE("draftAnswers"::text, ''), ${schoolId}) > 0
    )`,
  );

  const uniqueUserIds = [...new Set(affectedUserIds)];
  if (uniqueUserIds.length > 0) {
    conditions.push(Prisma.sql`"userId" IN (${Prisma.join(uniqueUserIds)})`);
  }

  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "QuestionnaireResponse"
    WHERE ${Prisma.join(conditions, ' OR ')}
  `);

  return rows.map((row) => row.id);
}

function syncQuestionnaireDraftAnswers(
  rawDraftAnswers: Prisma.JsonValue | null,
  options: {
    allowedSchoolIds: readonly string[];
    rewrittenSchoolIds?: Readonly<Record<string, string | null>>;
  },
) {
  if (!isRecord(rawDraftAnswers) || !isRecord(rawDraftAnswers.hardMatchForm)) {
    return rawDraftAnswers;
  }

  const hardMatchForm = rawDraftAnswers.hardMatchForm;
  const hasExcludedPartnerSchools = Object.prototype.hasOwnProperty.call(
    hardMatchForm,
    'excludedPartnerSchools',
  );
  const hasExcludedPartnerSchoolGenders = Object.prototype.hasOwnProperty.call(
    hardMatchForm,
    'excludedPartnerSchoolGenders',
  );
  const syncedExcludedPartnerPreferences = syncExcludedPartnerSchoolPreferences(
    {
      excludedPartnerSchools: hardMatchForm.excludedPartnerSchools,
      excludedPartnerSchoolGenders: hardMatchForm.excludedPartnerSchoolGenders,
    },
    options,
  );
  const syncedHardMatchForm: Record<string, Prisma.InputJsonValue> = {
    ...(hardMatchForm as Record<string, Prisma.InputJsonValue>),
  };

  if (
    syncedExcludedPartnerPreferences.excludedPartnerSchools.length > 0 ||
    hasExcludedPartnerSchools
  ) {
    syncedHardMatchForm.excludedPartnerSchools =
      syncedExcludedPartnerPreferences.excludedPartnerSchools;
  } else {
    delete syncedHardMatchForm.excludedPartnerSchools;
  }

  if (
    syncedExcludedPartnerPreferences.excludedPartnerSchoolGenders.length > 0 ||
    hasExcludedPartnerSchoolGenders
  ) {
    syncedHardMatchForm.excludedPartnerSchoolGenders =
      syncedExcludedPartnerPreferences.excludedPartnerSchoolGenders;
  } else {
    delete syncedHardMatchForm.excludedPartnerSchoolGenders;
  }

  return {
    ...(rawDraftAnswers as Record<string, Prisma.InputJsonValue>),
    hardMatchForm: syncedHardMatchForm,
  };
}

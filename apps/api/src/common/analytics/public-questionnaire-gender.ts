import { HARD_MATCH_KEYS } from '@lilink/shared';
import { Prisma } from '../prisma/client';

// Public lifetime statistics only; archives never grant current matching eligibility.
export const publicQuestionnaireGenderJoin = Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT candidate.gender
    FROM (
      SELECT TRIM(r."answers"->>${HARD_MATCH_KEYS.gender}) AS gender,
        0 AS priority, r."submittedAt" AS submitted_at,
        r."updatedAt" AS saved_at, r."id" AS id
      FROM "QuestionnaireResponse" r
      WHERE r."userId" = u."id" AND r."submittedAt" IS NOT NULL
      UNION ALL
      SELECT TRIM(a."answers"->>${HARD_MATCH_KEYS.gender}) AS gender,
        1 AS priority, a."submittedAt" AS submitted_at,
        a."archivedAt" AS saved_at, a."id" AS id
      FROM "QuestionnaireResponseArchive" a
      WHERE a."userId" = u."id" AND a."submittedAt" IS NOT NULL
    ) candidate
    WHERE candidate.gender IN ('男', '女', '非二元')
    ORDER BY candidate.priority, candidate.submitted_at DESC,
      candidate.saved_at DESC, candidate.id DESC
    LIMIT 1
  ) public_gender ON TRUE
`;

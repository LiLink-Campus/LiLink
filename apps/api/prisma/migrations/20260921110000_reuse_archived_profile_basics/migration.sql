BEGIN;

-- Only pristine rows from the autumn reset may inherit these two profile fields.
-- Account names and contact methods were never reset and remain authoritative.
LOCK TABLE "QuestionnaireResponse" IN SHARE ROW EXCLUSIVE MODE;

WITH historical_profile AS (
  SELECT a."sourceResponseId", a."userId", a."archivedAt",
    CASE WHEN (a."draftAnswers"->'hardMatchForm') ? 'gender'
      THEN a."draftAnswers"->'hardMatchForm'->'gender'
      ELSE a."answers"->'hard_gender' END AS gender,
    CASE WHEN (a."draftAnswers"->'hardMatchForm') ? 'oneLinerIntro'
      THEN a."draftAnswers"->'hardMatchForm'->'oneLinerIntro'
      ELSE a."answers"->'hard_one_liner_intro' END AS intro
  FROM "QuestionnaireResponseArchive" a
  WHERE a."releaseId" = 'autumn-reset-2026-09-20'
), reusable_profile AS (
  SELECT *,
    CASE WHEN gender IN ('"男"'::jsonb, '"女"'::jsonb, '"非二元"'::jsonb)
      THEN jsonb_build_object('hard_gender', gender) ELSE '{}'::jsonb END
    || CASE WHEN jsonb_typeof(intro) = 'string'
      AND length(btrim(intro #>> '{}')) BETWEEN 1 AND 200
      THEN jsonb_build_object('hard_one_liner_intro', btrim(intro #>> '{}'))
      ELSE '{}'::jsonb END AS basics
  FROM historical_profile
)
UPDATE "QuestionnaireResponse" r
SET "answers" = p.basics, "updatedAt" = CURRENT_TIMESTAMP
FROM reusable_profile p, "User" u, "QuestionnaireVersion" v
WHERE r."id" = p."sourceResponseId" AND r."userId" = p."userId"
  AND u."id" = r."userId" AND u."deactivatedAt" IS NULL
  AND v."id" = r."versionId" AND v."isCurrent"
  AND r."updatedAt" = p."archivedAt"
  AND r."answers" = '{}'::jsonb AND r."draftAnswers" IS NULL
  AND r."submittedAt" IS NULL
  AND r."acknowledgedQuestionnaireVersionId" IS NULL
  AND r."acknowledgedQuestionnaireKeys" IS NULL
  AND r."acknowledgedHardMatchSignatures" IS NULL
  AND p.basics <> '{}'::jsonb;

COMMIT;

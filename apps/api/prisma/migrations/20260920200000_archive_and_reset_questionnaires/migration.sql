BEGIN;

CREATE TABLE "QuestionnaireResponseArchive" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "releaseId" TEXT NOT NULL,
  "sourceResponseId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "versionId" TEXT NOT NULL REFERENCES "QuestionnaireVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "answers" JSONB NOT NULL,
  "draftAnswers" JSONB,
  "acknowledgedQuestionnaireVersionId" TEXT,
  "acknowledgedQuestionnaireKeys" JSONB,
  "acknowledgedHardMatchSignatures" JSONB,
  "submittedAt" TIMESTAMP(3),
  "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "QuestionnaireResponseArchive_releaseId_sourceResponseId_key"
  ON "QuestionnaireResponseArchive"("releaseId", "sourceResponseId");
CREATE INDEX "QuestionnaireResponseArchive_userId_archivedAt_idx"
  ON "QuestionnaireResponseArchive"("userId", "archivedAt");
ALTER TABLE "MatchParticipant" ADD COLUMN "profileSnapshot" JSONB;

DO $$
DECLARE
  current_id TEXT;
  new_id TEXT;
  release_id CONSTANT TEXT := 'autumn-reset-2026-09-20';
BEGIN
  LOCK TABLE "QuestionnaireVersion", "Question", "QuestionnaireResponse",
    "MatchCycle", "MatchParticipant", "CycleParticipation", "UserCycleDashboardSnapshot"
    IN SHARE ROW EXCLUSIVE MODE;
  IF (SELECT COUNT(*) FROM "QuestionnaireVersion" WHERE "isCurrent") > 1 THEN
    RAISE EXCEPTION 'Exactly one current questionnaire is required for the reset';
  END IF;
  IF EXISTS (SELECT 1 FROM "MatchCycle" WHERE "status" IN ('PREPARING', 'REVEAL_READY')) THEN
    RAISE EXCEPTION 'Resolve prepared unrevealed cycles before resetting questionnaires';
  END IF;

  INSERT INTO "QuestionnaireResponseArchive" (
    "id", "releaseId", "sourceResponseId", "userId", "versionId", "answers", "draftAnswers",
    "acknowledgedQuestionnaireVersionId", "acknowledgedQuestionnaireKeys",
    "acknowledgedHardMatchSignatures", "submittedAt", "sourceUpdatedAt"
  )
  SELECT 'reset_archive_' || md5("id"), release_id, "id", "userId", "versionId", "answers", "draftAnswers",
    "acknowledgedQuestionnaireVersionId", "acknowledgedQuestionnaireKeys",
    "acknowledgedHardMatchSignatures", "submittedAt", "updatedAt"
  FROM "QuestionnaireResponse";

  IF EXISTS (
    SELECT 1 FROM "QuestionnaireResponse" r
    LEFT JOIN "QuestionnaireResponseArchive" a
      ON a."sourceResponseId" = r."id" AND a."releaseId" = release_id
    WHERE a."id" IS NULL OR
      ROW(a."userId", a."versionId", a."answers", a."draftAnswers", a."submittedAt", a."sourceUpdatedAt",
          a."acknowledgedQuestionnaireVersionId", a."acknowledgedQuestionnaireKeys", a."acknowledgedHardMatchSignatures")
      IS DISTINCT FROM
      ROW(r."userId", r."versionId", r."answers", r."draftAnswers", r."submittedAt", r."updatedAt",
          r."acknowledgedQuestionnaireVersionId", r."acknowledgedQuestionnaireKeys", r."acknowledgedHardMatchSignatures")
  ) THEN RAISE EXCEPTION 'Questionnaire archive verification failed'; END IF;

  -- Freeze the information visible at cutover, not a claimed historical reconstruction.
  UPDATE "MatchParticipant" p SET "profileSnapshot" = jsonb_build_object(
    'source', 'pre-reset-visible-profile', 'releaseId', release_id,
    'archiveId', a."id", 'versionId', a."versionId",
    'introLine', COALESCE(NULLIF(btrim(a."answers"->>'hard_one_liner_intro'), ''), NULLIF(btrim(up."headline"), '')),
    'gender', a."answers"->'hard_gender',
    'partnerGenders', COALESCE(a."answers"->'hard_partner_genders', '[]'::jsonb)
  )
  FROM "User" u
  LEFT JOIN "QuestionnaireResponseArchive" a ON a."userId" = u."id" AND a."releaseId" = release_id
  LEFT JOIN "UserProfile" up ON up."userId" = u."id"
  WHERE p."userId" = u."id";

  SELECT "id" INTO current_id FROM "QuestionnaireVersion" WHERE "isCurrent";
  IF current_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM "QuestionnaireResponse") THEN
      RAISE EXCEPTION 'Cannot reset existing answers without a current questionnaire';
    END IF;
    RETURN;
  END IF;
  new_id := 'autumn_reset_' || md5(current_id);
  INSERT INTO "QuestionnaireVersion" ("id", "title", "description", "isCurrent", "updatedAt")
    SELECT new_id, "title", "description", false, CURRENT_TIMESTAMP FROM "QuestionnaireVersion" WHERE "id" = current_id;
  INSERT INTO "Question" ("id", "versionId", "key", "prompt", "description", "type", "weight", "order", "required", "selectionLimit", "options")
    SELECT 'reset_question_' || md5(new_id || ':' || "id"), new_id, "key", "prompt", "description", "type", "weight", "order", "required", "selectionLimit", "options"
    FROM "Question" WHERE "versionId" = current_id;
  UPDATE "QuestionnaireVersion" SET "isCurrent" = false, "updatedAt" = CURRENT_TIMESTAMP WHERE "id" = current_id;
  UPDATE "QuestionnaireVersion" SET "isCurrent" = true WHERE "id" = new_id;
  UPDATE "QuestionnaireResponse" SET
    "versionId" = new_id, "answers" = '{}'::jsonb, "draftAnswers" = NULL,
    "acknowledgedQuestionnaireVersionId" = NULL, "acknowledgedQuestionnaireKeys" = NULL,
    "acknowledgedHardMatchSignatures" = NULL, "submittedAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP;
  UPDATE "CycleParticipation" cp SET "status" = 'OPTED_OUT', "intent" = NULL, "optedInAt" = NULL, "updatedAt" = CURRENT_TIMESTAMP
    FROM "MatchCycle" c WHERE c."id" = cp."cycleId" AND c."status" <> 'REVEALED';
  DELETE FROM "UserCycleDashboardSnapshot";
END $$;

COMMIT;

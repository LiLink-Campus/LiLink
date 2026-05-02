DROP INDEX IF EXISTS "Question_key_key";

CREATE UNIQUE INDEX "Question_versionId_key_key" ON "Question"("versionId", "key");

UPDATE "QuestionnaireVersion"
SET "isCurrent" = false
WHERE "isCurrent" = true
  AND "id" NOT IN (
    SELECT "id"
    FROM "QuestionnaireVersion"
    WHERE "isCurrent" = true
    ORDER BY "createdAt" DESC, "id" DESC
    LIMIT 1
  );

CREATE UNIQUE INDEX "QuestionnaireVersion_single_current_key"
  ON "QuestionnaireVersion"("isCurrent")
  WHERE "isCurrent" = true;

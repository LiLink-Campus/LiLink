DROP INDEX IF EXISTS "Question_key_key";

CREATE UNIQUE INDEX "Question_versionId_key_key" ON "Question"("versionId", "key");

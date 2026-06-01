-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN "lastActiveAt" TIMESTAMP(3);

-- lastLoginAt is an auth audit field; existing users have no reliable value.
-- Existing users predate activity tracking, so start the inactivity window at deployment.
UPDATE "User" SET "lastActiveAt" = CURRENT_TIMESTAMP WHERE "lastActiveAt" IS NULL;

-- CreateIndex
CREATE INDEX "User_lastActiveAt_idx" ON "User"("lastActiveAt");

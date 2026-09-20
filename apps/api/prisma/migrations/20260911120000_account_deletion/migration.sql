ALTER TABLE "User" ADD COLUMN "deactivatedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "deactivatedEmail" TEXT;
CREATE INDEX "User_deactivatedAt_status_createdAt_idx" ON "User"("deactivatedAt", "status", "createdAt");
DROP INDEX "User_status_createdAt_idx";
ALTER TYPE "DashboardSnapshotLimitedReason" ADD VALUE 'ACCOUNT_DEACTIVATED';

-- Invalidate derived cards so existing revealed matches use direct contacts.
DELETE FROM "UserCycleDashboardSnapshot" WHERE "matchId" IS NOT NULL;

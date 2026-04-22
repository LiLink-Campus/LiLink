-- CreateEnum
CREATE TYPE "DashboardSnapshotResult" AS ENUM ('MATCHED', 'UNMATCHED', 'NOT_PARTICIPATED');

-- CreateEnum
CREATE TYPE "DashboardSnapshotVisibility" AS ENUM ('VISIBLE', 'LIMITED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "DashboardSnapshotLimitedReason" AS ENUM ('REPORTED', 'BLOCKED');

-- CreateTable
CREATE TABLE "UserCycleDashboardSnapshot" (
    "userId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "cycleRevealAt" TIMESTAMP(3) NOT NULL,
    "cycleCodename" TEXT NOT NULL,
    "participationStatus" "ParticipationStatus" NOT NULL,
    "result" "DashboardSnapshotResult" NOT NULL,
    "visibility" "DashboardSnapshotVisibility" NOT NULL,
    "limitedReason" "DashboardSnapshotLimitedReason",
    "matchId" TEXT,
    "matchPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCycleDashboardSnapshot_pkey" PRIMARY KEY ("userId","cycleId")
);

-- CreateIndex
CREATE INDEX "UserCycleDashboardSnapshot_userId_cycleRevealAt_idx" ON "UserCycleDashboardSnapshot"("userId", "cycleRevealAt");

-- CreateIndex
CREATE INDEX "UserCycleDashboardSnapshot_cycleId_cycleRevealAt_idx" ON "UserCycleDashboardSnapshot"("cycleId", "cycleRevealAt");

-- AddForeignKey
ALTER TABLE "UserCycleDashboardSnapshot" ADD CONSTRAINT "UserCycleDashboardSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCycleDashboardSnapshot" ADD CONSTRAINT "UserCycleDashboardSnapshot_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "MatchCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

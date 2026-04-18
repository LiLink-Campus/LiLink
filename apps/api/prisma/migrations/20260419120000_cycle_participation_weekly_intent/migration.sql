-- CreateEnum
CREATE TYPE "WeeklyIntent" AS ENUM ('FRIEND', 'DATE', 'BOTH');

-- AlterTable
ALTER TABLE "CycleParticipation" ADD COLUMN "intent" "WeeklyIntent";

-- CreateIndex
CREATE INDEX "CycleParticipation_cycleId_status_intent_idx" ON "CycleParticipation"("cycleId", "status", "intent");

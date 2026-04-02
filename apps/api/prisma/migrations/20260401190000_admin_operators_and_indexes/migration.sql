-- CreateTable
CREATE TABLE "AdminOperator" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminOperator_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "adminActorId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AdminOperator_email_key" ON "AdminOperator"("email");

-- CreateIndex
CREATE INDEX "AdminOperator_isActive_idx" ON "AdminOperator"("isActive");

-- CreateIndex
CREATE INDEX "User_status_createdAt_idx" ON "User"("status", "createdAt");

-- CreateIndex
CREATE INDEX "User_schoolId_idx" ON "User"("schoolId");

-- CreateIndex
CREATE INDEX "EmailCode_email_purpose_consumedAt_expiresAt_idx" ON "EmailCode"("email", "purpose", "consumedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "QuestionnaireVersion_isCurrent_idx" ON "QuestionnaireVersion"("isCurrent");

-- CreateIndex
CREATE INDEX "Question_versionId_order_idx" ON "Question"("versionId", "order");

-- CreateIndex
CREATE INDEX "QuestionnaireResponse_versionId_idx" ON "QuestionnaireResponse"("versionId");

-- CreateIndex
CREATE INDEX "QuestionnaireResponse_submittedAt_idx" ON "QuestionnaireResponse"("submittedAt");

-- CreateIndex
CREATE INDEX "MatchCycle_status_revealAt_idx" ON "MatchCycle"("status", "revealAt");

-- CreateIndex
CREATE INDEX "CycleParticipation_userId_status_idx" ON "CycleParticipation"("userId", "status");

-- CreateIndex
CREATE INDEX "Match_cycleId_createdAt_idx" ON "Match"("cycleId", "createdAt");

-- CreateIndex
CREATE INDEX "MatchParticipant_userId_createdAt_idx" ON "MatchParticipant"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Report_reportedUserId_status_idx" ON "Report"("reportedUserId", "status");

-- CreateIndex
CREATE INDEX "Report_reporterId_status_idx" ON "Report"("reporterId", "status");

-- CreateIndex
CREATE INDEX "Report_matchId_idx" ON "Report"("matchId");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_adminActorId_createdAt_idx" ON "AuditLog"("adminActorId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminActorId_fkey" FOREIGN KEY ("adminActorId") REFERENCES "AdminOperator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

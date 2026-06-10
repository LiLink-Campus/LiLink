-- CreateTable
CREATE TABLE "MeetupFeedback" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "personalFitScore" INTEGER NOT NULL,
    "interactionQualityScore" INTEGER NOT NULL,
    "safetyBoundaryLevel" TEXT NOT NULL,
    "positiveTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "issueTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MeetupFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetupFeedback_sessionId_authorUserId_key" ON "MeetupFeedback"("sessionId", "authorUserId");

-- CreateIndex
CREATE INDEX "MeetupFeedback_matchId_idx" ON "MeetupFeedback"("matchId");

-- CreateIndex
CREATE INDEX "MeetupFeedback_subjectUserId_safetyBoundaryLevel_idx" ON "MeetupFeedback"("subjectUserId", "safetyBoundaryLevel");

-- CreateIndex
CREATE INDEX "MeetupFeedback_authorUserId_createdAt_idx" ON "MeetupFeedback"("authorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "MeetupFeedback" ADD CONSTRAINT "MeetupFeedback_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MeetupSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupFeedback" ADD CONSTRAINT "MeetupFeedback_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupFeedback" ADD CONSTRAINT "MeetupFeedback_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupFeedback" ADD CONSTRAINT "MeetupFeedback_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

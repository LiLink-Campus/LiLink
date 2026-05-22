-- Remove DeepSeek match-narrative + match reason/topics features.
-- Existing Match / Question rows are preserved; only obsolete columns and the
-- now-unused enum are dropped.

-- AlterTable
ALTER TABLE "Question" DROP COLUMN "reasonRules";

-- AlterTable
ALTER TABLE "Match" DROP COLUMN "conversationTopics",
DROP COLUMN "narrativeSource",
DROP COLUMN "reason",
DROP COLUMN "reasons";

-- DropEnum
DROP TYPE "MatchNarrativeSource";

-- CreateTable
CREATE TABLE "MatchFeedback" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MatchFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchFeedback_subjectUserId_idx" ON "MatchFeedback"("subjectUserId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchFeedback_matchId_authorUserId_key" ON "MatchFeedback"("matchId", "authorUserId");

-- AddForeignKey
ALTER TABLE "MatchFeedback" ADD CONSTRAINT "MatchFeedback_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchFeedback" ADD CONSTRAINT "MatchFeedback_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchFeedback" ADD CONSTRAINT "MatchFeedback_subjectUserId_fkey" FOREIGN KEY ("subjectUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

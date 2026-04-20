-- CreateEnum
CREATE TYPE "MatchNarrativeSource" AS ENUM ('DEEPSEEK', 'RULES_FALLBACK');

-- AlterTable
ALTER TABLE "Match"
ADD COLUMN "reason" TEXT,
ADD COLUMN "conversationTopics" JSONB,
ADD COLUMN "narrativeSource" "MatchNarrativeSource";

-- CreateEnum
CREATE TYPE "MeetupSessionStatus" AS ENUM ('ACTIVE', 'LOCKED', 'CANCELED', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MeetupParticipantTurnState" AS ENUM ('NONE', 'REQUIRED', 'WAITING');

-- CreateEnum
CREATE TYPE "MeetupMessageType" AS ENUM ('PROPOSE', 'ACCEPT', 'REJECT', 'FINAL_CONFIRM', 'REVISE_AFTER_LOCK', 'CANCEL');

-- CreateEnum
CREATE TYPE "MeetupCancelReason" AS ENUM ('USER_CANCELED');

-- CreateEnum
CREATE TYPE "MeetupProposalScope" AS ENUM ('BOTH', 'TIME_ONLY', 'LOCATION_ONLY');

-- CreateEnum
CREATE TYPE "MeetupProposalStatus" AS ENUM ('PENDING', 'PARTIALLY_ACCEPTED', 'CONFIRMED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "MeetupOptionKind" AS ENUM ('TIME', 'LOCATION');

-- CreateEnum
CREATE TYPE "MeetupOptionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'DISABLED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "meetupExpirationWeeks" INTEGER NOT NULL DEFAULT 2;

-- AddCheck
ALTER TABLE "User" ADD CONSTRAINT "User_meetupExpirationWeeks_check" CHECK ("meetupExpirationWeeks" BETWEEN 1 AND 4);

-- CreateTable
CREATE TABLE "MeetupSession" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "status" "MeetupSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentProposalId" TEXT,
    "confirmedTimeOptionId" TEXT,
    "confirmedLocationOptionId" TEXT,
    "finalConfirmRequiredByUserId" TEXT,
    "startedByUserId" TEXT NOT NULL,
    "canceledByUserId" TEXT,
    "cancelReason" "MeetupCancelReason",
    "cancelNote" TEXT,
    "reopenedFromLockedAt" TIMESTAMP(3),
    "reopenedFromLockedStartsAt" TIMESTAMP(3),
    "lockVersion" INTEGER NOT NULL DEFAULT 0,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveExpirationWeeks" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "archiveEligibleAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetupSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetupParticipant" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchParticipantId" TEXT NOT NULL,
    "turnState" "MeetupParticipantTurnState" NOT NULL DEFAULT 'NONE',
    "responseRequiredAt" TIMESTAMP(3),
    "responseRequiredMessageId" TEXT,
    "revisionUsedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetupParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetupMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "type" "MeetupMessageType" NOT NULL,
    "notePreset" TEXT,
    "noteText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetupMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetupProposal" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "scope" "MeetupProposalScope" NOT NULL,
    "status" "MeetupProposalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetupProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetupOption" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "kind" "MeetupOptionKind" NOT NULL,
    "status" "MeetupOptionStatus" NOT NULL DEFAULT 'PENDING',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "toleranceMinutes" INTEGER NOT NULL DEFAULT 10,
    "locationCandidateId" TEXT,
    "placeName" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetupOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetupSession_matchId_key" ON "MeetupSession"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetupSession_currentProposalId_key" ON "MeetupSession"("currentProposalId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetupSession_confirmedTimeOptionId_key" ON "MeetupSession"("confirmedTimeOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetupSession_confirmedLocationOptionId_key" ON "MeetupSession"("confirmedLocationOptionId");

-- CreateIndex
CREATE INDEX "MeetupSession_status_lastActiveAt_idx" ON "MeetupSession"("status", "lastActiveAt");

-- CreateIndex
CREATE INDEX "MeetupSession_status_expiresAt_idx" ON "MeetupSession"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "MeetupSession_status_archiveEligibleAt_idx" ON "MeetupSession"("status", "archiveEligibleAt");

-- CreateIndex
CREATE INDEX "MeetupSession_startedByUserId_createdAt_idx" ON "MeetupSession"("startedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "MeetupSession_finalConfirmRequiredByUserId_idx" ON "MeetupSession"("finalConfirmRequiredByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetupParticipant_sessionId_userId_key" ON "MeetupParticipant"("sessionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetupParticipant_sessionId_matchParticipantId_key" ON "MeetupParticipant"("sessionId", "matchParticipantId");

-- CreateIndex
CREATE INDEX "MeetupParticipant_userId_turnState_idx" ON "MeetupParticipant"("userId", "turnState");

-- CreateIndex
CREATE INDEX "MeetupParticipant_responseRequiredAt_idx" ON "MeetupParticipant"("responseRequiredAt");

-- CreateIndex
CREATE INDEX "MeetupParticipant_responseRequiredMessageId_idx" ON "MeetupParticipant"("responseRequiredMessageId");

-- CreateIndex
CREATE INDEX "MeetupMessage_sessionId_createdAt_idx" ON "MeetupMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "MeetupMessage_actorUserId_createdAt_idx" ON "MeetupMessage"("actorUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MeetupProposal_messageId_key" ON "MeetupProposal"("messageId");

-- CreateIndex
CREATE INDEX "MeetupProposal_sessionId_status_createdAt_idx" ON "MeetupProposal"("sessionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MeetupProposal_sessionId_actorUserId_idx" ON "MeetupProposal"("sessionId", "actorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "meetup_proposal_one_pending_per_session" ON "MeetupProposal"("sessionId") WHERE "status" = 'PENDING';

-- CreateIndex
CREATE INDEX "MeetupOption_sessionId_kind_status_idx" ON "MeetupOption"("sessionId", "kind", "status");

-- CreateIndex
CREATE INDEX "MeetupOption_proposalId_kind_idx" ON "MeetupOption"("proposalId", "kind");

-- AddForeignKey
ALTER TABLE "MeetupSession" ADD CONSTRAINT "MeetupSession_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupSession" ADD CONSTRAINT "MeetupSession_currentProposalId_fkey" FOREIGN KEY ("currentProposalId") REFERENCES "MeetupProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupSession" ADD CONSTRAINT "MeetupSession_confirmedTimeOptionId_fkey" FOREIGN KEY ("confirmedTimeOptionId") REFERENCES "MeetupOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupSession" ADD CONSTRAINT "MeetupSession_confirmedLocationOptionId_fkey" FOREIGN KEY ("confirmedLocationOptionId") REFERENCES "MeetupOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupSession" ADD CONSTRAINT "MeetupSession_finalConfirmRequiredByUserId_fkey" FOREIGN KEY ("finalConfirmRequiredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupSession" ADD CONSTRAINT "MeetupSession_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupSession" ADD CONSTRAINT "MeetupSession_canceledByUserId_fkey" FOREIGN KEY ("canceledByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupParticipant" ADD CONSTRAINT "MeetupParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MeetupSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupParticipant" ADD CONSTRAINT "MeetupParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupParticipant" ADD CONSTRAINT "MeetupParticipant_matchParticipantId_fkey" FOREIGN KEY ("matchParticipantId") REFERENCES "MatchParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupParticipant" ADD CONSTRAINT "MeetupParticipant_responseRequiredMessageId_fkey" FOREIGN KEY ("responseRequiredMessageId") REFERENCES "MeetupMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupMessage" ADD CONSTRAINT "MeetupMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MeetupSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupMessage" ADD CONSTRAINT "MeetupMessage_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupProposal" ADD CONSTRAINT "MeetupProposal_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MeetupSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupProposal" ADD CONSTRAINT "MeetupProposal_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "MeetupMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupProposal" ADD CONSTRAINT "MeetupProposal_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupOption" ADD CONSTRAINT "MeetupOption_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "MeetupProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetupOption" ADD CONSTRAINT "MeetupOption_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "MeetupSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Remove the recruiter invite-code system; personal referral codes are retained.
-- Production has zero invite-code rows (empty table, no attributed users/events),
-- so these drops do not lose data.

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_inviteCodeId_fkey";

-- DropIndex
DROP INDEX "User_inviteCodeId_idx";

-- DropIndex
DROP INDEX "ReferralEvent_inviteCodeId_type_createdAt_idx";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "inviteCodeId";

-- AlterTable
ALTER TABLE "ReferralEvent" DROP COLUMN "inviteCodeId";

-- DropTable
DROP TABLE "InviteCode";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "nonEduReferralLimit" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "nonEduReferralUses" INTEGER NOT NULL DEFAULT 0;

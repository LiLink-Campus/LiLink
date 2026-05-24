-- CreateEnum
CREATE TYPE "ReferralChannel" AS ENUM ('WECHAT_MOMENTS', 'WECHAT_GROUP', 'WECHAT_PRIVATE', 'COPY_LINK', 'QR', 'OTHER');

-- CreateEnum
CREATE TYPE "ReferralEventType" AS ENUM ('CLICK', 'SHARE');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "CouponBenefitType" AS ENUM ('FULL_REDUCTION', 'DISCOUNT', 'GIFT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CouponStatus" AS ENUM ('ISSUED', 'REDEEMED', 'EXPIRED', 'VOID');

-- CreateEnum
CREATE TYPE "MerchantUserRole" AS ENUM ('OWNER', 'STAFF');

-- AlterTable
ALTER TABLE "InviteCode" ADD COLUMN     "campaignId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firstOptedInAt" TIMESTAMP(3),
ADD COLUMN     "referralCampaignId" TEXT,
ADD COLUMN     "referralChannel" "ReferralChannel",
ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredByUserId" TEXT;

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CouponTemplate" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "benefitType" "CouponBenefitType" NOT NULL,
    "rule" JSONB,
    "faceValue" INTEGER NOT NULL,
    "validDays" INTEGER,
    "validUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CouponTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignActivation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "couponsGrantedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignActivation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "CouponStatus" NOT NULL DEFAULT 'ISSUED',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactInfo" TEXT,
    "promotionBlocks" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantUser" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "role" "MerchantUserRole" NOT NULL DEFAULT 'STAFF',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Redemption" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantUserId" TEXT,
    "userId" TEXT NOT NULL,
    "faceValueSnapshot" INTEGER NOT NULL,
    "orderAmount" INTEGER,
    "actualDiscountAmount" INTEGER,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Redemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralEvent" (
    "id" TEXT NOT NULL,
    "type" "ReferralEventType" NOT NULL,
    "referrerUserId" TEXT,
    "inviteCodeId" TEXT,
    "campaignId" TEXT,
    "channel" "ReferralChannel",
    "dedupeKey" TEXT,
    "visitorHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_slug_key" ON "Campaign"("slug");

-- CreateIndex
CREATE INDEX "Campaign_status_startsAt_idx" ON "Campaign"("status", "startsAt");

-- CreateIndex
CREATE INDEX "CouponTemplate_campaignId_isActive_idx" ON "CouponTemplate"("campaignId", "isActive");

-- CreateIndex
CREATE INDEX "CouponTemplate_merchantId_idx" ON "CouponTemplate"("merchantId");

-- CreateIndex
CREATE INDEX "CampaignActivation_campaignId_activatedAt_idx" ON "CampaignActivation"("campaignId", "activatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignActivation_userId_campaignId_key" ON "CampaignActivation"("userId", "campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_userId_status_idx" ON "Coupon"("userId", "status");

-- CreateIndex
CREATE INDEX "Coupon_templateId_status_idx" ON "Coupon"("templateId", "status");

-- CreateIndex
CREATE INDEX "Coupon_status_expiresAt_idx" ON "Coupon"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_userId_templateId_key" ON "Coupon"("userId", "templateId");

-- CreateIndex
CREATE INDEX "Merchant_isActive_idx" ON "Merchant"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantUser_email_key" ON "MerchantUser"("email");

-- CreateIndex
CREATE INDEX "MerchantUser_merchantId_isActive_idx" ON "MerchantUser"("merchantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Redemption_couponId_key" ON "Redemption"("couponId");

-- CreateIndex
CREATE INDEX "Redemption_merchantId_redeemedAt_idx" ON "Redemption"("merchantId", "redeemedAt");

-- CreateIndex
CREATE INDEX "Redemption_userId_idx" ON "Redemption"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralEvent_dedupeKey_key" ON "ReferralEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "ReferralEvent_referrerUserId_type_createdAt_idx" ON "ReferralEvent"("referrerUserId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralEvent_campaignId_type_channel_createdAt_idx" ON "ReferralEvent"("campaignId", "type", "channel", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralEvent_inviteCodeId_type_createdAt_idx" ON "ReferralEvent"("inviteCodeId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "InviteCode_campaignId_idx" ON "InviteCode"("campaignId");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- CreateIndex
CREATE INDEX "User_referredByUserId_createdAt_idx" ON "User"("referredByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "User_referralCampaignId_createdAt_idx" ON "User"("referralCampaignId", "createdAt");

-- CreateIndex
CREATE INDEX "User_firstOptedInAt_idx" ON "User"("firstOptedInAt");

-- AddForeignKey
ALTER TABLE "InviteCode" ADD CONSTRAINT "InviteCode_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredByUserId_fkey" FOREIGN KEY ("referredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referralCampaignId_fkey" FOREIGN KEY ("referralCampaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponTemplate" ADD CONSTRAINT "CouponTemplate_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponTemplate" ADD CONSTRAINT "CouponTemplate_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignActivation" ADD CONSTRAINT "CampaignActivation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignActivation" ADD CONSTRAINT "CampaignActivation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CouponTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantUser" ADD CONSTRAINT "MerchantUser_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_merchantUserId_fkey" FOREIGN KEY ("merchantUserId") REFERENCES "MerchantUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Partial unique index: at most one ACTIVE default campaign.
-- Prisma cannot express partial indexes, so it is appended here by hand.
CREATE UNIQUE INDEX "campaign_single_active_default" ON "Campaign" ("isDefault") WHERE "isDefault" = true AND "status" = 'ACTIVE';

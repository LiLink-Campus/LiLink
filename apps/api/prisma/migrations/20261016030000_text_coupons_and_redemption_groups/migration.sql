BEGIN;
ALTER TABLE "CouponTemplate" ADD COLUMN "benefitText" TEXT;
-- Preserve every legacy tier as readable terms. Do not invent mutual exclusion
-- or issue new entitlements for already distributed coupons.
UPDATE "CouponTemplate" t SET "benefitText" = COALESCE(
  (SELECT string_agg(
    CASE WHEN (tier->>'minSpend')::numeric > 0 THEN '消费满' || trim_scale((tier->>'minSpend')::numeric / 100)::text || '元，' ELSE '' END ||
    CASE tier->'benefit'->>'type'
      WHEN 'AMOUNT_OFF' THEN '减免' || trim_scale((tier->'benefit'->>'amountOff')::numeric / 100)::text || '元'
      WHEN 'PERCENT_OFF' THEN '减免' || (tier->'benefit'->>'percentOff') || '%' ||
        CASE WHEN tier->'benefit'->>'maxOff' IS NOT NULL THEN '，最多减免' || trim_scale((tier->'benefit'->>'maxOff')::numeric / 100)::text || '元' ELSE '' END
      WHEN 'GIFT' THEN '赠送' || (tier->'benefit'->>'description')
    END, E'\n' ORDER BY n)
   FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.rule->'tiers') = 'array' THEN t.rule->'tiers' ELSE '[]'::jsonb END) WITH ORDINALITY AS tiers(tier,n)), t.title);
ALTER TABLE "CouponTemplate" ALTER COLUMN "benefitText" SET NOT NULL;
ALTER TABLE "CouponTemplate" RENAME COLUMN "description" TO "usageNotes";
ALTER TABLE "CouponTemplate" DROP COLUMN "benefitType", DROP COLUMN "rule", DROP COLUMN "faceValue";
ALTER TABLE "Redemption" ALTER COLUMN "faceValueSnapshot" DROP NOT NULL;
ALTER TABLE "Coupon" ADD COLUMN "voidReason" TEXT;
CREATE TABLE "CouponRedemptionGroup" (
  id TEXT PRIMARY KEY,
  "campaignId" TEXT NOT NULL REFERENCES "Campaign"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "merchantId" TEXT NOT NULL REFERENCES "Merchant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  name TEXT NOT NULL
);
CREATE UNIQUE INDEX "CouponRedemptionGroup_campaignId_merchantId_name_key" ON "CouponRedemptionGroup"("campaignId", "merchantId", name);
CREATE UNIQUE INDEX "CouponRedemptionGroup_campaignId_merchantId_id_key" ON "CouponRedemptionGroup"("campaignId", "merchantId", id);
ALTER TABLE "CouponTemplate" ADD COLUMN "redemptionGroupId" TEXT;
ALTER TABLE "CouponTemplate" ADD CONSTRAINT "CouponTemplate_campaignId_merchantId_redemptionGroupId_fkey" FOREIGN KEY ("campaignId", "merchantId", "redemptionGroupId") REFERENCES "CouponRedemptionGroup"("campaignId", "merchantId", id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "CouponTemplate_redemptionGroupId_idx" ON "CouponTemplate"("redemptionGroupId");
CREATE TABLE "CouponGroupRedemption" (
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "groupId" TEXT NOT NULL REFERENCES "CouponRedemptionGroup"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "couponId" TEXT NOT NULL REFERENCES "Coupon"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("userId", "groupId")
);
CREATE UNIQUE INDEX "CouponGroupRedemption_couponId_key" ON "CouponGroupRedemption"("couponId");

DROP TYPE "CouponBenefitType";
COMMIT;

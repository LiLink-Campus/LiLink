-- Preserve existing access and issuance restrictions before retiring the switch.
UPDATE "MerchantUser" AS account
SET "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP
FROM "Merchant" AS merchant
WHERE account."merchantId" = merchant.id AND NOT merchant."isActive" AND account."isActive";

UPDATE "CouponTemplate" AS template
SET "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP
FROM "Merchant" AS merchant
WHERE template."merchantId" = merchant.id AND NOT merchant."isActive" AND template."isActive";

DROP INDEX "Merchant_isActive_idx";
ALTER TABLE "Merchant" DROP COLUMN "isActive";

UPDATE "CouponTemplate" AS template
SET "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP
FROM "Campaign" AS campaign
WHERE template."campaignId" = campaign.id
  AND campaign.status = 'ENDED'
  AND template."isActive" = true;

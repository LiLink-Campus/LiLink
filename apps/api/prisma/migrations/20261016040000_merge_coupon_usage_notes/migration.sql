BEGIN;
UPDATE "CouponTemplate"
SET "benefitText" = CASE
  WHEN btrim("benefitText") = '' THEN "usageNotes"
  ELSE "benefitText" || E'\n\n' || "usageNotes"
END
WHERE "usageNotes" IS NOT NULL AND btrim("usageNotes") <> '';
ALTER TABLE "CouponTemplate" DROP COLUMN "usageNotes";
COMMIT;

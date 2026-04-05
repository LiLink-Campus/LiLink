ALTER TABLE "EmailCode"
ADD COLUMN "deliveryDedupeKey" TEXT,
ADD COLUMN "deliveryStatus" "OutboundEmailStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "sentAt" TIMESTAMP(3);

UPDATE "EmailCode"
SET
  "deliveryDedupeKey" = 'legacy-email-code:' || "id",
  "deliveryStatus" = 'EXHAUSTED'
WHERE "deliveryDedupeKey" IS NULL;

ALTER TABLE "EmailCode"
ALTER COLUMN "deliveryDedupeKey" SET NOT NULL;

DROP INDEX "EmailCode_email_purpose_consumedAt_expiresAt_idx";

CREATE UNIQUE INDEX "EmailCode_deliveryDedupeKey_key"
ON "EmailCode"("deliveryDedupeKey");

CREATE INDEX "EmailCode_email_purpose_deliveryStatus_consumedAt_expiresAt_idx"
ON "EmailCode"("email", "purpose", "deliveryStatus", "consumedAt", "expiresAt");

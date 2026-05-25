-- CreateIndex
-- Use CONCURRENTLY so building this index on a large Coupon table does not lock
-- out coupon issuance/redemption writes. Prisma runs each migration outside a
-- transaction, and CONCURRENTLY cannot run inside one, so this must remain the
-- only statement in this migration. IF NOT EXISTS keeps `migrate deploy`
-- idempotent if the index was created manually beforehand.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Coupon_templateId_issuedAt_idx" ON "Coupon"("templateId","issuedAt");

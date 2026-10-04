ALTER TABLE "PublicCacheInvalidation"
  ADD COLUMN "verifiedHash" TEXT,
  ADD COLUMN "lastVerificationAt" TIMESTAMP(3),
  ADD COLUMN "verificationTargetHash" TEXT,
  ADD COLUMN "verificationFailures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "verificationLeaseUntil" TIMESTAMP(3),
  ADD COLUMN "verificationLeaseToken" TEXT;

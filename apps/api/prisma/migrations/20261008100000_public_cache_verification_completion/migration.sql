ALTER TABLE "PublicCacheInvalidation"
  ADD COLUMN "verificationCompletedRevision" BIGINT,
  ADD COLUMN "verificationOutcome" TEXT
    CHECK ("verificationOutcome" IN ('verified', 'unsupported'));

-- Historical equal hashes do not prove the most recent acknowledgment was
-- verified. Leave completion NULL so startup recovers that durable target.

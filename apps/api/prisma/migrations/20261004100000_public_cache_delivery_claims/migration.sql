ALTER TABLE "PublicCacheInvalidation"
  ADD COLUMN "claimedRevision" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "lastClaimedAt" TIMESTAMP(3);

-- Preserve the high-water mark and delivery interval during an existing upgrade.
UPDATE "PublicCacheInvalidation"
SET "claimedRevision" = "acknowledgedRevision", "lastClaimedAt" = "lastDeliveredAt";

CREATE OR REPLACE FUNCTION lilink_queue_public_cache(cache_scope TEXT, is_urgent BOOLEAN)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  requested_at TIMESTAMP(3) := clock_timestamp();
  target_at TIMESTAMP(3) := requested_at + CASE WHEN is_urgent THEN INTERVAL '5 seconds' ELSE INTERVAL '30 minutes' END;
BEGIN
  INSERT INTO "PublicCacheInvalidation" ("scope", "urgent", "dueAt")
  VALUES (cache_scope, is_urgent, target_at)
  ON CONFLICT ("scope") DO UPDATE SET
    "revision" = "PublicCacheInvalidation"."revision" + 1,
    "urgent" = CASE WHEN "PublicCacheInvalidation"."revision" = "PublicCacheInvalidation"."acknowledgedRevision"
      THEN is_urgent ELSE "PublicCacheInvalidation"."urgent" OR is_urgent END,
    "dueAt" = GREATEST(
      COALESCE("PublicCacheInvalidation"."lastAttemptAt" + INTERVAL '60 seconds', requested_at),
      COALESCE("PublicCacheInvalidation"."lastClaimedAt" + INTERVAL '30 minutes', requested_at),
      CASE WHEN "PublicCacheInvalidation"."revision" = "PublicCacheInvalidation"."acknowledgedRevision"
        OR "PublicCacheInvalidation"."exhaustedAt" IS NOT NULL THEN target_at
        ELSE LEAST("PublicCacheInvalidation"."dueAt", target_at) END
    ),
    "attempts" = CASE WHEN "PublicCacheInvalidation"."exhaustedAt" IS NOT NULL THEN 0 ELSE "PublicCacheInvalidation"."attempts" END,
    "exhaustedAt" = NULL,
    "updatedAt" = requested_at;
END;
$$;

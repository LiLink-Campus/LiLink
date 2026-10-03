CREATE TABLE "PublicCacheInvalidation" (
  "scope" TEXT PRIMARY KEY CHECK ("scope" IN ('home', 'schools')),
  "revision" BIGINT NOT NULL DEFAULT 1,
  "acknowledgedRevision" BIGINT NOT NULL DEFAULT 0,
  "urgent" BOOLEAN NOT NULL DEFAULT false,
  "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMP(3),
  "lastDeliveredAt" TIMESTAMP(3),
  "deliveredHash" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "leaseToken" TEXT,
  "exhaustedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One durable row per scope coalesces changes in the original business transaction.
CREATE FUNCTION lilink_queue_public_cache(cache_scope TEXT, is_urgent BOOLEAN)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  requested_at TIMESTAMP(3) := clock_timestamp();
  target_at TIMESTAMP(3) := requested_at + CASE WHEN is_urgent THEN INTERVAL '5 seconds' ELSE INTERVAL '15 minutes' END;
BEGIN
  INSERT INTO "PublicCacheInvalidation" ("scope", "urgent", "dueAt")
  VALUES (cache_scope, is_urgent, target_at)
  ON CONFLICT ("scope") DO UPDATE SET
    "revision" = "PublicCacheInvalidation"."revision" + 1,
    "urgent" = CASE WHEN "PublicCacheInvalidation"."revision" = "PublicCacheInvalidation"."acknowledgedRevision"
      THEN is_urgent ELSE "PublicCacheInvalidation"."urgent" OR is_urgent END,
    "dueAt" = GREATEST(
      COALESCE("PublicCacheInvalidation"."lastAttemptAt" + INTERVAL '60 seconds', target_at),
      CASE WHEN "PublicCacheInvalidation"."revision" = "PublicCacheInvalidation"."acknowledgedRevision"
        OR "PublicCacheInvalidation"."exhaustedAt" IS NOT NULL THEN target_at
        ELSE LEAST("PublicCacheInvalidation"."dueAt", target_at) END
    ),
    "attempts" = CASE WHEN "PublicCacheInvalidation"."exhaustedAt" IS NOT NULL THEN 0 ELSE "PublicCacheInvalidation"."attempts" END,
    "exhaustedAt" = NULL,
    "updatedAt" = requested_at;
END;
$$;

-- Compare only fields capable of affecting a public projection. The dispatcher
-- also hashes the resulting aggregate, so equivalent writes never call Web.
CREATE FUNCTION lilink_public_cache_projection(table_name TEXT, row_data JSONB)
RETURNS JSONB LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF row_data IS NULL THEN RETURN NULL; END IF;
  CASE table_name
    WHEN 'User' THEN
      IF row_data->>'status' <> 'ACTIVE' OR row_data->>'deactivatedAt' IS NOT NULL
        OR (row_data->>'isTest')::boolean THEN RETURN NULL; END IF;
      RETURN jsonb_build_array(row_data->'id', row_data->'schoolId');
    WHEN 'QuestionnaireResponse', 'QuestionnaireResponseArchive' THEN
      IF row_data->>'submittedAt' IS NULL OR btrim(row_data->'answers'->>'hard_gender') NOT IN ('男', '女', '非二元')
        OR row_data->'answers'->>'hard_gender' IS NULL THEN RETURN NULL; END IF;
      RETURN jsonb_build_array(row_data->'userId', btrim(row_data->'answers'->>'hard_gender'),
        CASE WHEN table_name = 'QuestionnaireResponseArchive' THEN row_data->'submittedAt' ELSE NULL END);
    WHEN 'Match' THEN
      IF row_data->>'revealedAt' IS NULL OR row_data->>'introducedAt' IS NULL THEN RETURN NULL; END IF;
      RETURN row_data->'id';
    WHEN 'MatchParticipant' THEN
      RETURN jsonb_build_array(row_data->'matchId', row_data->'userId');
    WHEN 'MatchCycle' THEN
      IF row_data->>'status' NOT IN ('OPEN', 'PREPARING', 'REVEAL_READY') THEN RETURN NULL; END IF;
      RETURN jsonb_build_array(row_data->'id', row_data->'codename', row_data->'revealAt', row_data->'participationDeadline');
    WHEN 'School' THEN
      RETURN jsonb_build_array(row_data->'id', row_data->'name', row_data->'description', row_data->'registrationEligible');
    WHEN 'SchoolDomain' THEN
      RETURN jsonb_build_array(row_data->'schoolId', row_data->'domain');
    ELSE RETURN NULL;
  END CASE;
END;
$$;

CREATE FUNCTION lilink_invalidate_public_cache()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  before_value JSONB;
  after_value JSONB;
  is_school BOOLEAN := TG_TABLE_NAME IN ('School', 'SchoolDomain');
BEGIN
  IF TG_OP <> 'INSERT' THEN before_value := lilink_public_cache_projection(TG_TABLE_NAME, to_jsonb(OLD)); END IF;
  IF TG_OP <> 'DELETE' THEN after_value := lilink_public_cache_projection(TG_TABLE_NAME, to_jsonb(NEW)); END IF;
  IF before_value IS NOT DISTINCT FROM after_value THEN RETURN NULL; END IF;
  -- Always acquire scopes in this order, including cascading domain deletes.
  PERFORM lilink_queue_public_cache('home', is_school OR TG_TABLE_NAME = 'MatchCycle');
  IF is_school THEN PERFORM lilink_queue_public_cache('schools', true); END IF;
  RETURN NULL;
END;
$$;

-- Acquire shared outbox rows only after all business writes. Immediate triggers
-- invert the Match/User versus MatchCycle/Match lock order of deletion and reveal.
CREATE CONSTRAINT TRIGGER user_public_cache AFTER INSERT OR UPDATE OF "status", "deactivatedAt", "isTest", "schoolId" OR DELETE
  ON "User" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lilink_invalidate_public_cache();
CREATE CONSTRAINT TRIGGER questionnaire_public_cache AFTER INSERT OR UPDATE OF "userId", "answers", "submittedAt" OR DELETE
  ON "QuestionnaireResponse" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lilink_invalidate_public_cache();
CREATE CONSTRAINT TRIGGER questionnaire_archive_public_cache AFTER INSERT OR UPDATE OF "userId", "answers", "submittedAt" OR DELETE
  ON "QuestionnaireResponseArchive" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lilink_invalidate_public_cache();
CREATE CONSTRAINT TRIGGER match_public_cache AFTER INSERT OR UPDATE OF "revealedAt", "introducedAt" OR DELETE
  ON "Match" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lilink_invalidate_public_cache();
CREATE CONSTRAINT TRIGGER match_participant_public_cache AFTER INSERT OR UPDATE OF "matchId", "userId" OR DELETE
  ON "MatchParticipant" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lilink_invalidate_public_cache();
CREATE CONSTRAINT TRIGGER cycle_public_cache AFTER INSERT OR UPDATE OF "status", "codename", "revealAt", "participationDeadline" OR DELETE
  ON "MatchCycle" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lilink_invalidate_public_cache();
CREATE CONSTRAINT TRIGGER school_public_cache AFTER INSERT OR UPDATE OF "name", "description", "registrationEligible" OR DELETE
  ON "School" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lilink_invalidate_public_cache();
CREATE CONSTRAINT TRIGGER school_domain_public_cache AFTER INSERT OR UPDATE OF "schoolId", "domain" OR DELETE
  ON "SchoolDomain" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lilink_invalidate_public_cache();

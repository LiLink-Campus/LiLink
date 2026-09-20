-- Preserve old revealed cards without authorizing introductions skipped by the new flow.
-- The first autumn migration is the rollout boundary, not a hard-coded calendar date.
DO $$
BEGIN
  LOCK TABLE "User", "UserContactMethod", "Match", "MatchCycle",
    "MatchParticipant", "CycleParticipation", "Block", "Report",
    "UserCycleDashboardSnapshot" IN SHARE ROW EXCLUSIVE MODE;

  WITH rollout AS (
    SELECT MIN("started_at" AT TIME ZONE 'UTC') AS "startedAt"
    FROM "_prisma_migrations"
    WHERE "migration_name" = '20260911120000_account_deletion'
      AND "finished_at" IS NOT NULL
      AND "rolled_back_at" IS NULL
  ), eligible AS (
    SELECT m."id"
    FROM "Match" m
    JOIN "MatchCycle" cycle ON cycle."id" = m."cycleId"
    CROSS JOIN rollout
    WHERE m."introducedAt" IS NULL
      AND m."revealedAt" < rollout."startedAt"
      AND cycle."status" = 'REVEALED'
      AND (SELECT COUNT(*) FROM "MatchParticipant" p WHERE p."matchId" = m."id") = 2
      AND NOT EXISTS (
        SELECT 1
        FROM "MatchParticipant" p
        JOIN "User" u ON u."id" = p."userId"
        LEFT JOIN "CycleParticipation" cp
          ON cp."cycleId" = m."cycleId" AND cp."userId" = p."userId"
        WHERE p."matchId" = m."id"
          AND (u."status" <> 'ACTIVE' OR u."deactivatedAt" IS NOT NULL
            OR cp."status" IS DISTINCT FROM 'OPTED_IN' OR cp."intent" IS NULL)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM "Block" b
        JOIN "MatchParticipant" a ON a."userId" = b."blockerId" AND a."matchId" = m."id"
        JOIN "MatchParticipant" z ON z."userId" = b."blockedId" AND z."matchId" = m."id"
      )
      AND NOT EXISTS (SELECT 1 FROM "Report" r WHERE r."matchId" = m."id")
  ), authorized AS (
    UPDATE "Match" m
    SET "introducedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC',
        "updatedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
    FROM eligible
    WHERE m."id" = eligible."id"
    RETURNING m."id"
  )
  UPDATE "MatchParticipant" p
  SET "introducedContactType" = CASE
        WHEN p."introducedContactType" IS NOT NULL AND p."introducedContactValue" IS NOT NULL
          THEN p."introducedContactType"
        WHEN contact."value" IS NOT NULL THEN u."preferredContactChannel"
        ELSE 'EMAIL'::"ContactChannelType"
      END,
      "introducedContactValue" = CASE
        WHEN p."introducedContactType" IS NOT NULL AND p."introducedContactValue" IS NOT NULL
          THEN p."introducedContactValue"
        ELSE COALESCE(contact."value", u."email")
      END
  FROM authorized, "User" u
  LEFT JOIN "UserContactMethod" contact
    ON contact."userId" = u."id" AND contact."type" = u."preferredContactChannel"
    AND contact."type" <> 'EMAIL' AND BTRIM(contact."value") <> ''
  WHERE p."matchId" = authorized."id" AND p."userId" = u."id";

  -- Both newly authorized and previously unsafe cards are rebuilt by the guarded reader.
  DELETE FROM "UserCycleDashboardSnapshot" WHERE "matchId" IS NOT NULL;
END $$;

-- Legacy carry-forward rows cannot prove consent to automatic contact disclosure.
DO $$
DECLARE
  cutoff TIMESTAMP;
BEGIN
  LOCK TABLE "MatchCycle", "Match", "CycleParticipation",
    "UserCycleDashboardSnapshot" IN SHARE ROW EXCLUSIVE MODE;
  SELECT MIN("started_at" AT TIME ZONE 'UTC') INTO cutoff
  FROM "_prisma_migrations"
  WHERE "migration_name" = '20260920100000_require_fresh_cycle_opt_in'
    AND "rolled_back_at" IS NULL;
  IF cutoff IS NULL THEN
    RAISE EXCEPTION 'Run this migration through prisma migrate deploy';
  END IF;

  WITH retired AS (
    UPDATE "CycleParticipation" cp
    SET "status" = 'OPTED_OUT', "intent" = NULL, "optedInAt" = NULL,
        "updatedAt" = CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
    FROM "MatchCycle" cycle
    WHERE cycle."id" = cp."cycleId" AND cycle."status" <> 'REVEALED'
      AND cp."status" = 'OPTED_IN' AND cp."updatedAt" < cutoff
      AND NOT EXISTS (
        SELECT 1 FROM "MatchParticipant" p JOIN "Match" m ON m."id" = p."matchId"
        WHERE p."userId" = cp."userId" AND m."cycleId" = cp."cycleId"
          AND m."introducedAt" IS NOT NULL
      )
    RETURNING cp."cycleId", cp."userId"
  )
  DELETE FROM "UserCycleDashboardSnapshot" s USING retired r
  WHERE s."cycleId" = r."cycleId" AND s."userId" = r."userId";
END $$;

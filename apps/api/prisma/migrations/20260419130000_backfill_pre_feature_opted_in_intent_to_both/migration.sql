-- Backfill every pre-feature OPTED_IN row to BOTH.
--
-- Before weekly intent shipped, participation had no FRIEND / DATE / BOTH
-- choice at all. We treat those historical opt-ins as "still participating"
-- and normalize them to BOTH, the compatibility-preserving default.
--
-- After launch, sticky carry-over keeps the latest stored intent for OPTED_IN
-- users. This UPDATE only exists to seed the first intent value for rows that
-- predate the feature and therefore have no stored intent yet.
UPDATE "CycleParticipation"
   SET "intent" = 'BOTH'
 WHERE "status" = 'OPTED_IN'
   AND "intent" IS NULL;

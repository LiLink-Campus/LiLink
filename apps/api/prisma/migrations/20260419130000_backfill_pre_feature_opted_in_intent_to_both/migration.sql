-- Backfill: pre-feature OPTED_IN rows default to BOTH so the upgrade is
-- transparent to existing participants.
--
-- Background
-- ----------
-- The previous migration `20260419120000_cycle_participation_weekly_intent`
-- added a nullable `intent` column without a default value. Going forward,
-- the matching pipeline (cycles.service.ts ACTIVE_OPTED_IN_PARTICIPATION_FILTER)
-- treats `intent IS NULL` as "user has not picked this round" and excludes
-- those rows from the matching pool. That exclusion is the steady-state
-- product rule (every user must re-pick FRIEND / DATE / BOTH each cycle,
-- and sticky-cycle-participation deliberately clears intent on carry-over).
--
-- However, every CycleParticipation row that was OPTED_IN before this
-- feature shipped reflects the previous "no intent required" rule — the
-- user already expressed an active commitment to participate. Without a
-- backfill, those users would silently drop out of the very next cycle's
-- matching pool until they happen to log in and re-pick. To preserve the
-- intent they already expressed, we snap every existing OPTED_IN row to
-- BOTH, the bridge intent that is compatible with FRIEND, DATE, and BOTH.
--
-- Scope (one-off, deploy-time only)
-- ---------------------------------
-- This migration must run as part of the same `prisma migrate deploy` that
-- applied the column add — i.e. before any application traffic resumes —
-- so it cannot accidentally overwrite the intent=NULL values that
-- sticky-cycle-participation writes for future cycles. The standard CI/CD
-- "deploy = migrate + restart" sequence guarantees that ordering. Do NOT
-- run this migration manually after the application has been serving
-- traffic between the column add and now; in that case the matching pool
-- has already started accumulating sticky NULL rows, and this UPDATE would
-- incorrectly resurrect them as BOTH.
UPDATE "CycleParticipation"
   SET "intent" = 'BOTH'
 WHERE "status" = 'OPTED_IN'
   AND "intent" IS NULL;

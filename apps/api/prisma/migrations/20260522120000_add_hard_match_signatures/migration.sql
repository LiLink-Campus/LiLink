-- Add per-user confirmed hard-match option-set signatures.
-- Used by the "honest progress" attention logic to detect when an enum field's
-- option set changed since the user last confirmed it, and to record explicit
-- confirmation of an empty / "no limit" weight, so stale defaults stop counting
-- as confirmed answers.

-- AlterTable
ALTER TABLE "QuestionnaireResponse" ADD COLUMN "acknowledgedHardMatchSignatures" JSONB;

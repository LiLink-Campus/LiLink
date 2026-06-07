-- AlterTable
-- Default true backfills every existing school to eligible, preserving the
-- prior code-allowlist behavior for the current partner schools. New schools
-- created from the admin school center default to eligible and can be disabled.
ALTER TABLE "School" ADD COLUMN     "registrationEligible" BOOLEAN NOT NULL DEFAULT true;

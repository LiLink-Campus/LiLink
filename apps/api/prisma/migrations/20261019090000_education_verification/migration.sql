ALTER TABLE "User"
  ADD COLUMN "educationVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "educationVerificationMethod" TEXT,
  ADD COLUMN "educationEmail" TEXT;

-- Every pre-existing account passed the former school-email/invitation gate.
UPDATE "User"
SET "educationVerifiedAt" = "createdAt",
    "educationVerificationMethod" = 'LEGACY'
WHERE "deactivatedAt" IS NULL;

UPDATE "User" u
SET "educationEmail" = lower(u."email")
WHERE u."deactivatedAt" IS NULL
  AND EXISTS (
    SELECT 1 FROM "SchoolDomain" d
    JOIN "School" s ON s."id" = d."schoolId"
    WHERE s."registrationEligible" = true
      AND position('.' in d."domain") > 0
      AND (lower(d."domain") = split_part(lower(u."email"), '@', 2)
        OR right(split_part(lower(u."email"), '@', 2), length(d."domain") + 1) = '.' || lower(d."domain"))
  );

CREATE UNIQUE INDEX "User_educationEmail_key" ON "User"("educationEmail");
ALTER TABLE "User" ALTER COLUMN "nonEduReferralLimit" SET DEFAULT 0;

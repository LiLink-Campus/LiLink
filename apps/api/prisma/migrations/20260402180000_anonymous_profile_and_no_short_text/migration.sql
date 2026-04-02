ALTER TABLE "UserProfile"
DROP COLUMN IF EXISTS "birthDate",
DROP COLUMN IF EXISTS "gender",
DROP COLUMN IF EXISTS "seekingGender",
DROP COLUMN IF EXISTS "selfLooksTier",
DROP COLUMN IF EXISTS "partnerLooksPreference",
DROP COLUMN IF EXISTS "ethnicity",
DROP COLUMN IF EXISTS "partnerEthnicityPreference",
DROP COLUMN IF EXISTS "allowCrossSchool",
DROP COLUMN IF EXISTS "preferCrossSchool";

DELETE FROM "Question" WHERE "type" = 'SHORT_TEXT';

CREATE TYPE "QuestionType_new" AS ENUM ('SCALE', 'SINGLE_SELECT', 'MULTI_SELECT');

ALTER TABLE "Question"
ALTER COLUMN "type" TYPE "QuestionType_new"
USING ("type"::text::"QuestionType_new");

ALTER TYPE "QuestionType" RENAME TO "QuestionType_old";
ALTER TYPE "QuestionType_new" RENAME TO "QuestionType";

DROP TYPE "QuestionType_old";

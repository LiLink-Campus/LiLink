CREATE TYPE "ContactChannelType" AS ENUM ('EMAIL', 'WECHAT', 'QQ', 'PHONE');

ALTER TABLE "User"
ADD COLUMN "preferredContactChannel" "ContactChannelType" NOT NULL DEFAULT 'EMAIL';

CREATE TABLE "UserContactMethod" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "ContactChannelType" NOT NULL,
  "value" TEXT NOT NULL,
  "normalizedValue" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserContactMethod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserContactMethod_userId_type_key" ON "UserContactMethod"("userId", "type");

CREATE INDEX "UserContactMethod_type_normalizedValue_idx" ON "UserContactMethod"("type", "normalizedValue");

ALTER TABLE "UserContactMethod"
ADD CONSTRAINT "UserContactMethod_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MatchParticipant"
ADD COLUMN "introducedContactType" "ContactChannelType",
ADD COLUMN "introducedContactValue" TEXT;

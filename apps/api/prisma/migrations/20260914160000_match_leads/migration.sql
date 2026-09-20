CREATE TABLE "MatchLead" (
  "id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "contacted" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MatchLead_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MatchLead_phone_key" ON "MatchLead"("phone");

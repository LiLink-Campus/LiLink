CREATE TABLE "VipActivation" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "batch" TEXT NOT NULL,
    "userId" TEXT,
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VipActivation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VipActivation_valid_period" CHECK (
      ("userId" IS NULL AND "activatedAt" IS NULL AND "expiresAt" IS NULL) OR
      ("userId" IS NOT NULL AND "activatedAt" IS NOT NULL AND "expiresAt" IS NOT NULL AND "expiresAt" > "activatedAt")
    )
);
CREATE UNIQUE INDEX "VipActivation_codeHash_key" ON "VipActivation"("codeHash");
CREATE INDEX "VipActivation_userId_expiresAt_idx" ON "VipActivation"("userId", "expiresAt");
CREATE INDEX "VipActivation_batch_idx" ON "VipActivation"("batch");
ALTER TABLE "VipActivation" ADD CONSTRAINT "VipActivation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

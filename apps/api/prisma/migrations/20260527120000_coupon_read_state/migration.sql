-- CreateTable
CREATE TABLE "CouponReadState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponReadState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CouponReadState_userId_target_version_key" ON "CouponReadState"("userId", "target", "version");

-- CreateIndex
CREATE INDEX "CouponReadState_userId_target_idx" ON "CouponReadState"("userId", "target");

-- AddForeignKey
ALTER TABLE "CouponReadState" ADD CONSTRAINT "CouponReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

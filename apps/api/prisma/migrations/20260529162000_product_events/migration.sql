-- CreateEnum
CREATE TYPE "ProductEventKind" AS ENUM ('FOOTPRINT', 'INTENT', 'OUTCOME', 'PERFORMANCE', 'FRUSTRATION');

-- CreateEnum
CREATE TYPE "ProductEventSource" AS ENUM ('WEB', 'API', 'SERVER');

-- CreateEnum
CREATE TYPE "ProductEventOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'RECORDED', 'FAILED', 'EXHAUSTED');

-- CreateTable
CREATE TABLE "ProductEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ProductEventKind" NOT NULL,
    "source" "ProductEventSource" NOT NULL,
    "eventVersion" INTEGER NOT NULL DEFAULT 1,
    "userId" TEXT,
    "sessionId" TEXT,
    "intentId" TEXT,
    "correlationId" TEXT,
    "route" TEXT,
    "surface" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductEventOutbox" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventVersion" INTEGER NOT NULL DEFAULT 1,
    "userId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3),
    "status" "ProductEventOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastAttemptAt" TIMESTAMP(3),
    "nextAttemptAt" TIMESTAMP(3),
    "recordedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductEventOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductEvent_eventId_key" ON "ProductEvent"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductEventOutbox_eventId_key" ON "ProductEventOutbox"("eventId");

-- CreateIndex
CREATE INDEX "ProductEventOutbox_status_nextAttemptAt_createdAt_idx" ON "ProductEventOutbox"("status", "nextAttemptAt", "createdAt");

-- CreateIndex
CREATE INDEX "ProductEventOutbox_userId_status_idx" ON "ProductEventOutbox"("userId", "status");

-- CreateIndex
CREATE INDEX "ProductEventOutbox_createdAt_idx" ON "ProductEventOutbox"("createdAt");

-- CreateIndex
CREATE INDEX "ProductEvent_name_createdAt_idx" ON "ProductEvent"("name", "createdAt");

-- CreateIndex
CREATE INDEX "ProductEvent_kind_createdAt_idx" ON "ProductEvent"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "ProductEvent_userId_createdAt_idx" ON "ProductEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductEvent_sessionId_createdAt_idx" ON "ProductEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductEvent_route_createdAt_idx" ON "ProductEvent"("route", "createdAt");

-- CreateIndex
CREATE INDEX "ProductEvent_correlationId_idx" ON "ProductEvent"("correlationId");

-- CreateIndex
CREATE INDEX "ProductEvent_createdAt_idx" ON "ProductEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "ProductEvent" ADD CONSTRAINT "ProductEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

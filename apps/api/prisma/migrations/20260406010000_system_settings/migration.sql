-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- Seed defaults
INSERT INTO "SystemSetting" ("key", "value", "updatedAt")
VALUES
  ('max_registrations', '0', NOW())
ON CONFLICT ("key") DO NOTHING;

import { existsSync } from "fs";
import { join } from "path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Match apps/api `preloadMonorepoEnvIntoProcess`: repo-root .env then apps/api/.env (override).
// Default `dotenv/config` only reads CWD `.env`, so `npx prisma migrate deploy` from apps/api
// missed DATABASE_URL when it lived only in the monorepo root `.env`.
const apiRoot = __dirname;
const repoRoot = join(apiRoot, "..");
for (const entry of [
  { path: join(repoRoot, ".env"), override: false },
  { path: join(apiRoot, ".env"), override: true },
]) {
  if (existsSync(entry.path)) {
    loadEnv({ path: entry.path, override: entry.override });
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"] ?? "",
  },
});

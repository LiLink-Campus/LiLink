import { existsSync } from "fs";
import { join } from "path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Match scripts/load-env.mjs: repo-root .env then apps/api/.env (override).
// prisma.config.ts lives in apps/api, so the monorepo root is two levels up, not one (../ is apps/, not the repo).
const apiRoot = __dirname;
const repoRoot = join(apiRoot, "..", "..");
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

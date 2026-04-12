/**
 * Deletes the admin operator matching ADMIN_BOOTSTRAP_EMAIL, then runs bootstrap-admin.mjs
 * so the password from .env is applied. For local/dev recovery only.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { loadMonorepoEnv } from "./load-env.mjs";

loadMonorepoEnv();

const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
if (!email) {
  console.error("ADMIN_BOOTSTRAP_EMAIL is not set.");
  process.exit(1);
}

const prisma = new PrismaClient();
const deleted = await prisma.adminOperator.deleteMany({ where: { email } });
console.log(`Deleted ${deleted.count} admin row(s) for ${email}.`);
await prisma.$disconnect();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bootstrap = path.join(__dirname, "bootstrap-admin.mjs");
const result = spawnSync(process.execPath, [bootstrap], {
  stdio: "inherit",
  cwd: path.join(__dirname, ".."),
});
process.exit(result.status ?? 1);

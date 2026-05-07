/**
 * Deletes the admin operator matching ADMIN_BOOTSTRAP_EMAIL, then runs bootstrap-admin.mjs
 * so the password from .env is applied. For local/dev recovery only.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMonorepoEnv } from "./load-env.mjs";
import { loadPrismaClientModule } from "./prisma-client.mjs";

loadMonorepoEnv();

const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase();
if (!email) {
  console.error("ADMIN_BOOTSTRAP_EMAIL is not set.");
  process.exit(1);
}

const { createPrismaClient } = await loadPrismaClientModule();
const prisma = createPrismaClient();
const deleted = await prisma.adminOperator.deleteMany({ where: { email } });
console.log(`Deleted ${deleted.count} admin row(s) for ${email}.`);
await prisma.$disconnect();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bootstrap = path.join(__dirname, "bootstrap-admin.mjs");
const builtClient = path.join(
  __dirname,
  "..",
  "dist",
  "src",
  "common",
  "prisma",
  "client.js",
);
const command = existsSync(builtClient)
  ? process.execPath
  : process.platform === "win32"
    ? "npx.cmd"
    : "npx";
const args = existsSync(builtClient) ? [bootstrap] : ["tsx", bootstrap];
const result = spawnSync(command, args, {
  stdio: "inherit",
  cwd: path.join(__dirname, ".."),
});
process.exit(result.status ?? 1);

import { spawnSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";

const databaseUrl = process.env.DATABASE_URL;
const require = createRequire(import.meta.url);
const prismaPackageJsonPath = require.resolve("prisma/package.json");
const prismaPackageJson = require(prismaPackageJsonPath);
const prismaCliPath = path.resolve(
  path.dirname(prismaPackageJsonPath),
  prismaPackageJson.bin.prisma,
);

if (!databaseUrl) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

function runPrismaCommand(args) {
  const result = spawnSync(process.execPath, [prismaCliPath, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });

  if (result.error) {
    console.error(`Failed to execute Prisma command: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runPrismaCommand(["migrate", "deploy"]);
console.log("Database bootstrap completed through prisma migrate deploy.");

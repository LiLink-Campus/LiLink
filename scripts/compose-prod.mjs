import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const composeFile = path.join(repoRoot, "docker-compose.prod.yml");
const args = process.argv.slice(2);

if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: node scripts/compose-prod.mjs <docker compose args...>

Examples:
  node scripts/compose-prod.mjs config
  node scripts/compose-prod.mjs up -d --build api
  node scripts/compose-prod.mjs logs --tail 100 api
`);
  process.exit(args.length === 0 ? 1 : 0);
}

if (!existsSync(composeFile)) {
  console.error(`Missing production compose file at ${composeFile}.`);
  process.exit(1);
}

const env = {
  ...process.env,
  DOCKER_BUILDKIT: process.env.DOCKER_BUILDKIT || "1",
  COMPOSE_DOCKER_CLI_BUILD:
    process.env.COMPOSE_DOCKER_CLI_BUILD || "1",
};

if (!env.SENTRY_RELEASE?.trim()) {
  const release = resolveGitHead();
  if (release) {
    env.SENTRY_RELEASE = release;
    console.log(`Using SENTRY_RELEASE=${release}.`);
  }
}

const result = spawnSync(
  "docker",
  ["compose", "-f", composeFile, ...args],
  {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(`Failed to start docker compose: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);

function resolveGitHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return "";
  }

  const sha = result.stdout.trim();
  return /^[0-9a-f]{40}$/i.test(sha) ? sha : "";
}

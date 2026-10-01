import { spawnSync } from "node:child_process";

const [, , command, ...extraArgs] = process.argv;

if (command !== "dev" && command !== "build") {
  console.error("Usage: node scripts/run-storybook.mjs <dev|build> [...args]");
  process.exit(1);
}

const args =
  command === "dev"
    ? ["dev", "-p", "6006", ...extraArgs]
    : ["build", ...extraArgs];

const storybookBin = process.platform === "win32" ? "storybook.cmd" : "storybook";

const result = spawnSync(storybookBin, args, {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_API_BASE_URL:
      process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/v1",
    STORYBOOK_DISABLE_TELEMETRY:
      process.env.STORYBOOK_DISABLE_TELEMETRY || "1",
  },
});

process.exit(result.status ?? 1);

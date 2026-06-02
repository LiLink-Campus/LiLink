import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";
import dotenv from "dotenv";

const DEFAULT_ENV_FILE = "/run/secrets/api_env";
const envFilePath = process.env.API_ENV_FILE?.trim() || DEFAULT_ENV_FILE;

loadProductionEnv();

process.env.NODE_ENV = "production";
process.env.APP_ENV = resolveAppEnv();

requireEnv("DATABASE_URL");

const passthroughCommand = process.argv.slice(2);
if (passthroughCommand.length > 0) {
  runChecked(passthroughCommand[0], passthroughCommand.slice(1));
  process.exit(0);
}

runChecked("npx", ["prisma", "migrate", "deploy"]);
runChecked("node", ["scripts/bootstrap-admin.mjs"]);
runApp();

function loadProductionEnv() {
  if (!existsSync(envFilePath)) {
    console.error(`Production env file is missing at ${envFilePath}.`);
    process.exit(1);
  }

  const result = dotenv.config({ path: envFilePath, override: false });
  if (result.error) {
    console.error(`Failed to load production env file: ${result.error.message}`);
    process.exit(1);
  }
}

function requireEnv(name) {
  if (!process.env[name]?.trim()) {
    console.error(`${name} is required for the production API container.`);
    process.exit(1);
  }
}

function resolveAppEnv() {
  const appEnv = process.env.APP_ENV?.trim();
  if (!appEnv) {
    return "production";
  }

  if (appEnv !== "production") {
    console.error("APP_ENV must be production in the production API container.");
    process.exit(1);
  }

  return appEnv;
}

function runChecked(command, args) {
  const result = spawnSync(command, args, {
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`Failed to start ${command}: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runApp() {
  const child = spawn("node", ["dist/src/main.js"], {
    env: process.env,
    stdio: "inherit",
  });

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      child.kill(signal);
    });
  }

  child.on("error", (error) => {
    console.error(`Failed to start API: ${error.message}`);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal === "SIGINT") {
      process.exit(130);
    }
    if (signal === "SIGTERM") {
      process.exit(143);
    }
    process.exit(code ?? 1);
  });
}

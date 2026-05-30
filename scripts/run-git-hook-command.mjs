#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { getRepoRoot } from "./hooks/sync-hook-configs.mjs";

export function buildGitHookCommand(scriptName, options = {}) {
  assertScriptName(scriptName);

  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const commandExists = options.commandExists ?? defaultCommandExists;

  if (!truthyEnv(env.LILINK_DISABLE_MISE_HOOKS) && commandExists("mise")) {
    return {
      command: "mise",
      args: ["exec", "--", "npm", "run", scriptName],
      usesMise: true,
    };
  }

  const npmCommand =
    platform === "win32" && !env.npm_execpath ? "npm.cmd" : "npm";
  if (env.npm_execpath) {
    return {
      command: process.execPath,
      args: [env.npm_execpath, "run", scriptName],
      usesMise: false,
    };
  }

  return {
    command: npmCommand,
    args: ["run", scriptName],
    usesMise: false,
  };
}

export function runGitHookCommand(scriptName, options = {}) {
  const repoRoot = options.repoRoot ?? getRepoRoot();
  const stdio = options.stdio ?? "inherit";
  const spawn = options.spawn ?? spawnSync;
  const warn = options.warn ?? console.warn;
  const hookCommand = buildGitHookCommand(scriptName, options);

  if (!hookCommand.usesMise) {
    warn(
      "mise was not found on PATH; running Git hook with ambient npm/node. " +
        "Run npm run hooks:install after configuring mise if this fails.",
    );
  }

  const result = spawn(hookCommand.command, hookCommand.args, {
    cwd: repoRoot,
    stdio,
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

function defaultCommandExists(command) {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore",
    windowsHide: true,
  });
  return !result.error && result.status === 0;
}

function assertScriptName(scriptName) {
  if (typeof scriptName !== "string" || !/^[\w:-]+$/.test(scriptName)) {
    throw new Error("Expected an npm script name.");
  }
}

function truthyEnv(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false";
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = runGitHookCommand(process.argv[2]);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

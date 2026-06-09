#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { GIT_HOOK_CONFIGS } from "./hooks/registry.mjs";
import { syncAgentHookConfigs } from "./hooks/sync-hook-configs.mjs";

export const MINIMUM_GIT_VERSION = Object.freeze({
  major: 2,
  minor: 54,
  patch: 0,
});

export function parseGitVersion(gitVersionOutput) {
  if (typeof gitVersionOutput !== "string" || gitVersionOutput.trim() === "") {
    throw new Error("Expected git --version output to be a non-empty string.");
  }

  const match = gitVersionOutput.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Unable to parse Git version from: ${gitVersionOutput}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function isGitVersionAtLeast(gitVersionOutput, minimumVersion) {
  assertVersion(minimumVersion, "minimumVersion");

  const currentVersion = parseGitVersion(gitVersionOutput);
  const fields = ["major", "minor", "patch"];

  for (const field of fields) {
    if (currentVersion[field] > minimumVersion[field]) {
      return true;
    }

    if (currentVersion[field] < minimumVersion[field]) {
      return false;
    }
  }

  return true;
}

export function buildGitConfigArgs(hookConfig) {
  assertHookConfig(hookConfig);

  return [
    ["config", "set", `hook.${hookConfig.name}.event`, hookConfig.event],
    ["config", "set", `hook.${hookConfig.name}.command`, hookConfig.command],
  ];
}

function installHooks() {
  ensureGitRepository();

  const gitVersionOutput = runGit(["--version"], { encoding: "utf8" });
  if (!isGitVersionAtLeast(gitVersionOutput, MINIMUM_GIT_VERSION)) {
    throw new Error(
      `Git 2.54.0 or newer is required for config-based hooks. Found: ${gitVersionOutput.trim()}`,
    );
  }

  for (const hookConfig of GIT_HOOK_CONFIGS) {
    for (const args of buildGitConfigArgs(hookConfig)) {
      runGit(args, { stdio: "inherit" });
    }
  }

  console.log("Installed LiLink Git config-based hooks:");
  for (const hookConfig of GIT_HOOK_CONFIGS) {
    console.log(`- ${hookConfig.event}: ${hookConfig.command}`);
  }

  const syncedFiles = syncAgentHookConfigs();
  console.log("Synced LiLink agent hook config files:");
  for (const syncedFile of syncedFiles) {
    console.log(`- ${syncedFile}`);
  }
}

function ensureGitRepository() {
  try {
    const output = runGit(["rev-parse", "--is-inside-work-tree"], {
      encoding: "utf8",
    });

    if (output.trim() !== "true") {
      throw new Error("Current directory is not inside a Git work tree.");
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Unable to verify Git repository: ${error.message}`);
    }

    throw error;
  }
}

function runGit(args, options = {}) {
  return execFileSync("git", args, {
    ...options,
    windowsHide: true,
  });
}

function assertVersion(version, name) {
  if (!version || typeof version !== "object") {
    throw new Error(`${name} must be a version object.`);
  }

  for (const field of ["major", "minor", "patch"]) {
    if (!Number.isInteger(version[field]) || version[field] < 0) {
      throw new Error(`${name}.${field} must be a non-negative integer.`);
    }
  }
}

function assertHookConfig(hookConfig) {
  if (!hookConfig || typeof hookConfig !== "object") {
    throw new Error("hookConfig must be an object.");
  }

  for (const field of ["name", "event", "command"]) {
    if (typeof hookConfig[field] !== "string" || hookConfig[field].trim() === "") {
      throw new Error(`hookConfig.${field} must be a non-empty string.`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    installHooks();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  AGENT_HOOK_CONFIG_FILES,
  GIT_HOOK_CONFIGS,
  serializeHookConfig,
} from "./registry.mjs";
import { getRepoRoot } from "./sync-hook-configs.mjs";

export function auditGitHookConfigs(repoRoot = getRepoRoot()) {
  assertRepoRoot(repoRoot);

  return GIT_HOOK_CONFIGS.map((hookConfig) => {
    const eventKey = `hook.${hookConfig.name}.event`;
    const commandKey = `hook.${hookConfig.name}.command`;
    const events = readGitConfigValues(repoRoot, eventKey);
    const commands = readGitConfigValues(repoRoot, commandKey);
    const expectedEvents = [hookConfig.event];
    const expectedCommands = [hookConfig.command];

    if (!arrayEqual(events, expectedEvents)) {
      return {
        path: `git config ${eventKey}`,
        ok: false,
        reason: `expected ${expectedEvents.join(", ") || "<empty>"}, found ${
          events.join(", ") || "<empty>"
        }`,
      };
    }

    if (!arrayEqual(commands, expectedCommands)) {
      return {
        path: `git config ${commandKey}`,
        ok: false,
        reason: `expected ${expectedCommands.join(", ") || "<empty>"}, found ${
          commands.join(", ") || "<empty>"
        }`,
      };
    }

    return {
      path: `git config hook.${hookConfig.name}`,
      ok: true,
      reason: "matches registry",
    };
  });
}

export function auditAgentHookConfigs(repoRoot = getRepoRoot()) {
  assertRepoRoot(repoRoot);

  const results = [];

  for (const hookFile of AGENT_HOOK_CONFIG_FILES) {
    const targetPath = path.join(repoRoot, hookFile.path);
    const expected = serializeHookConfig(hookFile.config);
    const exists = existsSync(targetPath);
    const actual = exists ? readFileSync(targetPath, "utf8") : "";

    results.push({
      path: hookFile.path,
      ok: exists && actual === expected,
      reason: exists ? "content mismatch" : "missing file",
    });
  }

  return results;
}

function readGitConfigValues(repoRoot, key) {
  try {
    const output = execFileSync("git", ["-C", repoRoot, "config", "--get-all", key], {
      encoding: "utf8",
      windowsHide: true,
    });

    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch (error) {
    if (typeof error?.status === "number" && error.status === 1) {
      return [];
    }

    throw error;
  }
}

function arrayEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function assertRepoRoot(repoRoot) {
  if (typeof repoRoot !== "string" || repoRoot.trim() === "") {
    throw new Error("repoRoot must be a non-empty string.");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const repoRoot = getRepoRoot();
    const results = [
      ...auditGitHookConfigs(repoRoot),
      ...auditAgentHookConfigs(repoRoot),
    ];
    const failures = results.filter((result) => !result.ok);

    if (failures.length === 0) {
      console.log("Hook configuration matches scripts/hooks/registry.mjs.");
      process.exit(0);
    }

    console.error("Hook configuration is out of sync:");
    for (const failure of failures) {
      console.error(`- ${failure.path}: ${failure.reason}`);
    }
    console.error("Run npm run hooks:install to reinstall Git hooks and regenerate agent hook files.");
    process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

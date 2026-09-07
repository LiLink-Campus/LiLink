#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { GIT_HOOK_CONFIGS } from "./registry.mjs";
import { getRepoRoot } from "../get-repo-root.mjs";

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
    const results = auditGitHookConfigs(repoRoot);
    const failures = results.filter((result) => !result.ok);

    if (failures.length === 0) {
      console.log("Hook configuration matches scripts/hooks/registry.mjs.");
      process.exit(0);
    }

    console.error("Hook configuration is out of sync:");
    for (const failure of failures) {
      console.error(`- ${failure.path}: ${failure.reason}`);
    }
    console.error("Run npm run hooks:install to reinstall Git hooks.");
    process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

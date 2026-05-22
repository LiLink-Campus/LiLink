#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  AGENT_HOOK_CONFIG_FILES,
  serializeHookConfig,
} from "./registry.mjs";

export function syncAgentHookConfigs(repoRoot = getRepoRoot()) {
  assertRepoRoot(repoRoot);

  const syncedFiles = [];

  for (const hookFile of AGENT_HOOK_CONFIG_FILES) {
    const targetPath = path.join(repoRoot, hookFile.path);
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, serializeHookConfig(hookFile.config), "utf8");
    syncedFiles.push(hookFile.path);
  }

  return syncedFiles;
}

export function getRepoRoot() {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

function assertRepoRoot(repoRoot) {
  if (typeof repoRoot !== "string" || repoRoot.trim() === "") {
    throw new Error("repoRoot must be a non-empty string.");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const syncedFiles = syncAgentHookConfigs();
    console.log("Synced agent hook config files:");
    for (const syncedFile of syncedFiles) {
      console.log(`- ${syncedFile}`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

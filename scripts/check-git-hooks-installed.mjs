#!/usr/bin/env node

import { pathToFileURL } from "node:url";

import { auditGitHookConfigs } from "./hooks/audit-hook-configs.mjs";
import { getRepoRoot } from "./hooks/sync-hook-configs.mjs";

export function shouldSkipGitHookInstallCheck(env = process.env) {
  return (
    truthyEnv(env.CI) ||
    truthyEnv(env.LILINK_SKIP_HOOK_INSTALL_CHECK)
  );
}

export function checkGitHooksInstalled({
  repoRoot,
  env = process.env,
  warn = console.warn,
} = {}) {
  if (shouldSkipGitHookInstallCheck(env)) {
    return { ok: true, skipped: true, reason: "disabled" };
  }

  let resolvedRepoRoot = repoRoot;
  if (!resolvedRepoRoot) {
    try {
      resolvedRepoRoot = getRepoRoot();
    } catch {
      return { ok: true, skipped: true, reason: "not-git-repo" };
    }
  }

  let failures;
  try {
    failures = auditGitHookConfigs(resolvedRepoRoot).filter(
      (result) => !result.ok,
    );
  } catch {
    return { ok: true, skipped: true, reason: "git-config-unavailable" };
  }

  if (failures.length === 0) {
    return { ok: true, skipped: false, failures };
  }

  warn(formatGitHookInstallWarning(failures));
  return { ok: false, skipped: false, failures };
}

export function formatGitHookInstallWarning(failures) {
  const lines = [
    "LiLink Git hooks are not installed or are out of sync.",
    "Run npm run hooks:install to enable local pre-commit and pre-push checks.",
  ];

  for (const failure of failures) {
    lines.push(`- ${failure.path}: ${failure.reason}`);
  }

  return lines.join("\n");
}

function truthyEnv(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== "" && normalized !== "0" && normalized !== "false";
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkGitHooksInstalled();
}

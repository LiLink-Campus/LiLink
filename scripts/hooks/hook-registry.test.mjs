import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { auditGitHookConfigs } from "./audit-hook-configs.mjs";
import { GIT_HOOK_CONFIGS } from "./registry.mjs";

test("audits installed Git hook config against the registry", () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "lilink-git-hooks-"));

  try {
    execFileSync("git", ["init"], {
      cwd: repoRoot,
      stdio: "ignore",
      windowsHide: true,
    });

    for (const hookConfig of GIT_HOOK_CONFIGS) {
      execFileSync(
        "git",
        ["-C", repoRoot, "config", `hook.${hookConfig.name}.event`, hookConfig.event],
        { windowsHide: true },
      );
      execFileSync(
        "git",
        ["-C", repoRoot, "config", `hook.${hookConfig.name}.command`, hookConfig.command],
        { windowsHide: true },
      );
    }

    assert.deepEqual(
      auditGitHookConfigs(repoRoot).map(({ path: configPath, ok }) => ({
        path: configPath,
        ok,
      })),
      [
        { path: "git config hook.lilink-pre-commit-lint", ok: true },
        { path: "git config hook.lilink-pre-push-lint", ok: true },
      ],
    );
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

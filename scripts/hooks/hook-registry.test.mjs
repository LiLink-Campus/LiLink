import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  auditAgentHookConfigs,
  auditGitHookConfigs,
} from "./audit-hook-configs.mjs";
import {
  AGENT_HOOK_CONFIG_FILES,
  GIT_HOOK_CONFIGS,
  serializeHookConfig,
} from "./registry.mjs";
import { syncAgentHookConfigs } from "./sync-hook-configs.mjs";

test("keeps all hook definitions in the registry", () => {
  assert.deepEqual(GIT_HOOK_CONFIGS, [
    {
      name: "lilink-pre-commit-lint",
      event: "pre-commit",
      command: "node scripts/run-git-hook-command.mjs lint:staged",
    },
    {
      name: "lilink-pre-push-lint",
      event: "pre-push",
      command: "node scripts/run-git-hook-command.mjs lint:pre-push",
    },
  ]);

  assert.deepEqual(
    AGENT_HOOK_CONFIG_FILES.map((hookFile) => hookFile.path),
    [".codex/hooks.json", ".cursor/hooks.json", ".claude/settings.json"],
  );
});

test("serializes agent hook configs with a stable trailing newline", () => {
  const serialized = serializeHookConfig(AGENT_HOOK_CONFIG_FILES[0].config);
  assert.equal(serialized.endsWith("\n"), true);
  assert.deepEqual(JSON.parse(serialized), AGENT_HOOK_CONFIG_FILES[0].config);
});

test("syncs and audits generated agent hook config files", () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "lilink-hooks-"));

  try {
    assert.deepEqual(syncAgentHookConfigs(repoRoot), [
      ".codex/hooks.json",
      ".cursor/hooks.json",
      ".claude/settings.json",
    ]);

    for (const hookFile of AGENT_HOOK_CONFIG_FILES) {
      assert.equal(
        readFileSync(path.join(repoRoot, hookFile.path), "utf8"),
        serializeHookConfig(hookFile.config),
      );
    }

    assert.deepEqual(
      auditAgentHookConfigs(repoRoot).map(({ path: filePath, ok }) => ({
        path: filePath,
        ok,
      })),
      [
        { path: ".codex/hooks.json", ok: true },
        { path: ".cursor/hooks.json", ok: true },
        { path: ".claude/settings.json", ok: true },
      ],
    );
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

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

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  checkGitHooksInstalled,
  formatGitHookInstallWarning,
  shouldSkipGitHookInstallCheck,
} from "./check-git-hooks-installed.mjs";
import { GIT_HOOK_CONFIGS } from "./hooks/registry.mjs";

test("skips the Git hook install check in CI", () => {
  const warnings = [];

  assert.equal(shouldSkipGitHookInstallCheck({ CI: "true" }), true);
  assert.deepEqual(
    checkGitHooksInstalled({
      repoRoot: "/not/a/repo",
      env: { CI: "true" },
      warn: (message) => warnings.push(message),
    }),
    { ok: true, skipped: true, reason: "disabled" },
  );
  assert.deepEqual(warnings, []);
});

test("warns when Git hooks are missing", () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "lilink-missing-hooks-"));
  const warnings = [];

  try {
    execFileSync("git", ["init"], {
      cwd: repoRoot,
      stdio: "ignore",
      windowsHide: true,
    });

    const result = checkGitHooksInstalled({
      repoRoot,
      env: {},
      warn: (message) => warnings.push(message),
    });

    assert.equal(result.ok, false);
    assert.equal(result.skipped, false);
    assert.equal(result.failures.length, 2);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /npm run hooks:install/);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("does not warn when Git hooks match the registry", () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "lilink-installed-hooks-"));
  const warnings = [];

  try {
    execFileSync("git", ["init"], {
      cwd: repoRoot,
      stdio: "ignore",
      windowsHide: true,
    });

    for (const hookConfig of GIT_HOOK_CONFIGS) {
      execFileSync(
        "git",
        [
          "-C",
          repoRoot,
          "config",
          `hook.${hookConfig.name}.event`,
          hookConfig.event,
        ],
        { windowsHide: true },
      );
      execFileSync(
        "git",
        [
          "-C",
          repoRoot,
          "config",
          `hook.${hookConfig.name}.command`,
          hookConfig.command,
        ],
        { windowsHide: true },
      );
    }

    assert.deepEqual(
      checkGitHooksInstalled({
        repoRoot,
        env: {},
        warn: (message) => warnings.push(message),
      }),
      { ok: true, skipped: false, failures: [] },
    );
    assert.deepEqual(warnings, []);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("formats the hook install warning with failed config details", () => {
  assert.equal(
    formatGitHookInstallWarning([
      {
        path: "git config hook.lilink-pre-commit-lint.event",
        reason: "expected pre-commit, found <empty>",
      },
    ]),
    [
      "LiLink Git hooks are not installed or are out of sync.",
      "Run npm run hooks:install to enable local pre-commit and pre-push checks.",
      "- git config hook.lilink-pre-commit-lint.event: expected pre-commit, found <empty>",
    ].join("\n"),
  );
});

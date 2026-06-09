import assert from "node:assert/strict";
import test from "node:test";

import { GIT_HOOK_CONFIGS } from "./hooks/registry.mjs";
import {
  MINIMUM_GIT_VERSION,
  buildGitConfigArgs,
  isGitVersionAtLeast,
  parseGitVersion,
} from "./install-git-hooks.mjs";

test("parses Git versions with platform suffixes", () => {
  assert.deepEqual(parseGitVersion("git version 2.54.0.windows.1"), {
    major: 2,
    minor: 54,
    patch: 0,
  });
});

test("checks the minimum Git version", () => {
  assert.equal(
    isGitVersionAtLeast("git version 2.54.0.windows.1", MINIMUM_GIT_VERSION),
    true,
  );
  assert.equal(
    isGitVersionAtLeast("git version 2.53.9", MINIMUM_GIT_VERSION),
    false,
  );
  assert.equal(
    isGitVersionAtLeast("git version 3.0.0", MINIMUM_GIT_VERSION),
    true,
  );
});

test("builds config commands for the LiLink hooks", () => {
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

  assert.deepEqual(buildGitConfigArgs(GIT_HOOK_CONFIGS[0]), [
    ["config", "set", "hook.lilink-pre-commit-lint.event", "pre-commit"],
    [
      "config",
      "set",
      "hook.lilink-pre-commit-lint.command",
      "node scripts/run-git-hook-command.mjs lint:staged",
    ],
  ]);
});

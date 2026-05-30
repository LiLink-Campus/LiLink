import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGitHookCommand,
  runGitHookCommand,
} from "./run-git-hook-command.mjs";

test("uses mise to run Git hook npm scripts when available", () => {
  assert.deepEqual(
    buildGitHookCommand("lint:staged", {
      env: {},
      commandExists: (command) => command === "mise",
    }),
    {
      command: "mise",
      args: ["exec", "--", "npm", "run", "lint:staged"],
      usesMise: true,
    },
  );
});

test("falls back to ambient npm when mise is unavailable", () => {
  assert.deepEqual(
    buildGitHookCommand("lint:pre-push", {
      env: {},
      platform: "darwin",
      commandExists: () => false,
    }),
    {
      command: "npm",
      args: ["run", "lint:pre-push"],
      usesMise: false,
    },
  );
});

test("allows opting out of mise for hook debugging", () => {
  assert.deepEqual(
    buildGitHookCommand("lint:staged", {
      env: { LILINK_DISABLE_MISE_HOOKS: "1" },
      platform: "darwin",
      commandExists: (command) => command === "mise",
    }),
    {
      command: "npm",
      args: ["run", "lint:staged"],
      usesMise: false,
    },
  );
});

test("runs the selected hook command from the repo root", () => {
  const calls = [];
  const warnings = [];
  const status = runGitHookCommand("lint:staged", {
    repoRoot: "/repo",
    env: {},
    commandExists: (command) => command === "mise",
    stdio: "pipe",
    warn: (message) => warnings.push(message),
    spawn: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0 };
    },
  });

  assert.equal(status, 0);
  assert.deepEqual(warnings, []);
  assert.deepEqual(calls, [
    {
      command: "mise",
      args: ["exec", "--", "npm", "run", "lint:staged"],
      options: {
        cwd: "/repo",
        stdio: "pipe",
        windowsHide: true,
      },
    },
  ]);
});

test("rejects invalid npm script names", () => {
  assert.throws(
    () =>
      buildGitHookCommand("lint:staged && rm -rf /", {
        commandExists: () => true,
      }),
    /Expected an npm script name/,
  );
});

export const GIT_HOOK_CONFIGS = Object.freeze([
  Object.freeze({
    name: "lilink-pre-commit-lint",
    event: "pre-commit",
    command: "node scripts/run-git-hook-command.mjs lint:staged",
  }),
  Object.freeze({
    name: "lilink-pre-push-lint",
    event: "pre-push",
    command: "node scripts/run-git-hook-command.mjs lint:pre-push",
  }),
]);

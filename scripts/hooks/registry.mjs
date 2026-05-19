export const GIT_HOOK_CONFIGS = Object.freeze([
  Object.freeze({
    name: "lilink-pre-commit-lint",
    event: "pre-commit",
    command: "npm run lint:staged",
  }),
  Object.freeze({
    name: "lilink-pre-push-lint",
    event: "pre-push",
    command: "npm run lint:pre-push",
  }),
]);

export const AGENT_HOOK_CONFIG_FILES = Object.freeze([
  Object.freeze({
    tool: "codex",
    path: ".codex/hooks.json",
    config: Object.freeze({
      hooks: Object.freeze({
        PostToolUse: Object.freeze([
          Object.freeze({
            matcher: "^apply_patch$",
            hooks: Object.freeze([
              Object.freeze({
                type: "command",
                command: "node scripts/hooks/codex-post-validate-web-css.mjs",
                timeout: 45,
                statusMessage: "Validating apps/web CSS",
              }),
            ]),
          }),
        ]),
      }),
    }),
  }),
  Object.freeze({
    tool: "cursor",
    path: ".cursor/hooks.json",
    config: Object.freeze({
      version: 1,
      hooks: Object.freeze({
        preToolUse: Object.freeze([
          Object.freeze({
            command: "node scripts/hooks/cursor-pre-validate-web-css.mjs",
            matcher: "^(Write|str_replace|search_replace|StrReplace)$",
            timeout: 45,
          }),
        ]),
      }),
    }),
  }),
]);

export function serializeHookConfig(config) {
  assertPlainObject(config, "config");
  return `${JSON.stringify(config, null, 2)}\n`;
}

function assertPlainObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }
}

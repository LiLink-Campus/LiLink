#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { getRepoRoot, validateClaudePostToolUse } from "../web-css-syntax.mjs";

async function main() {
  const raw = readFileSync(0, "utf8");
  let payload;

  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    process.exit(0);
    return;
  }

  const repoRoot = getRepoRoot();
  const outcome = validateClaudePostToolUse(payload, repoRoot);

  if (outcome.ok) {
    process.exit(0);
    return;
  }

  process.stdout.write(`${JSON.stringify(outcome.hookStdout)}\n`);
  process.exit(2);
}

main().catch(() => {
  process.exit(0);
});

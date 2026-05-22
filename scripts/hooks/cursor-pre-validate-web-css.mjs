#!/usr/bin/env node

import { readFileSync } from "node:fs";
import {
  getRepoRoot,
  validateCursorPreToolUse,
} from "../web-css-syntax.mjs";

async function main() {
  const raw = readFileSync(0, "utf8");
  let payload;

  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    process.stdout.write(JSON.stringify({ permission: "allow" }));
    return;
  }

  const repoRoot = getRepoRoot();
  const result = validateCursorPreToolUse(payload, repoRoot);
  process.stdout.write(JSON.stringify(result));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ permission: "allow" }));
});

import assert from "node:assert/strict";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { linkAgentSkills } from "./agent-skills-link.mjs";

function makeRepoWithSkill() {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "lilink-skills-"));
  const skillDir = path.join(repoRoot, ".agent-local", "skills", "demo");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: demo\n---\n");
  return repoRoot;
}

test("creates project-level symlinks for both tools", () => {
  const repoRoot = makeRepoWithSkill();
  try {
    linkAgentSkills(repoRoot);
    for (const toolDir of [".codex/skills", ".claude/skills"]) {
      const link = path.join(repoRoot, toolDir, "demo");
      assert.equal(lstatSync(link).isSymbolicLink(), true);
      assert.equal(readlinkSync(link), "../../.agent-local/skills/demo");
    }
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("is idempotent", () => {
  const repoRoot = makeRepoWithSkill();
  try {
    linkAgentSkills(repoRoot);
    const second = linkAgentSkills(repoRoot);
    assert.equal(
      second.every((result) => result.outcome === "ok"),
      true,
    );
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("does not clobber a real directory", () => {
  const repoRoot = makeRepoWithSkill();
  try {
    const realDir = path.join(repoRoot, ".claude", "skills", "demo");
    mkdirSync(realDir, { recursive: true });
    const results = linkAgentSkills(repoRoot);
    const claudeResult = results.find(
      (result) => result.link === ".claude/skills/demo",
    );
    assert.equal(claudeResult.outcome, "skipped-real-path");
    assert.equal(lstatSync(realDir).isDirectory(), true);
    assert.equal(lstatSync(realDir).isSymbolicLink(), false);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

test("no-op when no skills source exists", () => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "lilink-skills-empty-"));
  try {
    assert.deepEqual(linkAgentSkills(repoRoot), []);
  } finally {
    rmSync(repoRoot, { recursive: true, force: true });
  }
});

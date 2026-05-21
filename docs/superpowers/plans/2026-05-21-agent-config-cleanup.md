# Agent Config Cleanup & Unification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Claude Code into the unified hook registry, consolidate personal skills into one neutral local source discovered by both Codex and Claude via project-level symlinks, and remove scratch/empty dirs — without changing rules content or touching `~/.codex`.

**Architecture:** `scripts/hooks/registry.mjs` stays the single source of truth for agent hooks; we add a `claude` adapter entry so `npm run hooks:sync` also generates `.claude/settings.json`. Personal skills move from the non-discovered `.codex-local/skills` to a neutral, gitignored `.agent-local/skills`; a new idempotent `scripts/agent-skills-link.mjs` creates project-level symlinks (`.codex/skills/<name>`, `.claude/skills/<name>`) that both tools auto-discover. Cleanup and `.gitignore`/`AGENTS.md` edits follow.

**Tech Stack:** Node.js ESM scripts, `node:test`, PostCSS (already a dependency), Git config-based hooks.

**Reference spec:** `docs/superpowers/specs/2026-05-21-agent-config-cleanup-design.md`

**Conventions for this plan:**
- Run all commands from the repo root.
- The validator functions (`validateCodex*`, `validateCursor*`) have no unit tests in this repo; they are verified by running the adapter. We follow that existing pattern for the new Claude validator (runtime-verified), and add unit tests only where the repo already has them (the hook registry and the new skills linker).
- `.agent-local/`, `.codex/skills/`, `.claude/skills/` are gitignored; `.claude/settings.json` is tracked (generated adapter, like `.codex/hooks.json`).

---

## Task 1: Claude web-CSS validator function + PostToolUse adapter

**Files:**
- Modify: `scripts/web-css-syntax.mjs` (add `validateClaudePostToolUse`)
- Create: `scripts/hooks/claude-post-validate-web-css.mjs`

- [ ] **Step 1: Add `validateClaudePostToolUse` to `scripts/web-css-syntax.mjs`**

Insert this function immediately after `validateCodexAfterApplyPatch` (after its closing `}` near line 267). It reuses the file-private helpers `toolInputPath`, `normalizeToRepoRel`, `isWebAppCss`, `loadPostcss`, `validateFile`, and the already-imported `existsSync`.

```js
export function validateClaudePostToolUse(payload, repoRoot) {
  const toolName = payload.tool_name;
  if (toolName !== "Write" && toolName !== "Edit" && toolName !== "MultiEdit") {
    return { ok: true };
  }

  const relPathRaw = toolInputPath(payload.tool_input);
  if (!relPathRaw) {
    return { ok: true };
  }

  const cwd = payload.cwd ?? repoRoot;
  const absPath = path.isAbsolute(relPathRaw)
    ? path.normalize(relPathRaw)
    : path.normalize(path.join(cwd, relPathRaw));
  const rel = normalizeToRepoRel(repoRoot, absPath);

  if (!isWebAppCss(rel) || !existsSync(absPath)) {
    return { ok: true };
  }

  const postcss = loadPostcss(repoRoot);

  try {
    validateFile(repoRoot, postcss, absPath);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason = `${rel}: ${message}`;
    return {
      ok: false,
      reason,
      hookStdout: {
        decision: "block",
        reason: `Web CSS syntax check failed:\n${reason}`,
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: `Fix CSS syntax errors, then retry:\n${reason}`,
        },
      },
    };
  }
}
```

- [ ] **Step 2: Create `scripts/hooks/claude-post-validate-web-css.mjs`**

Mirror of `codex-post-validate-web-css.mjs` (PostToolUse: print block JSON + exit 2 on failure, else exit 0):

```js
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
```

- [ ] **Step 3: Verify the adapter blocks invalid CSS and passes valid CSS**

```bash
# invalid CSS -> expect exit 2 + block JSON
printf '.x { color: red; ' > apps/web/__hooktest__.css
printf '{"tool_name":"Write","tool_input":{"file_path":"apps/web/__hooktest__.css"}}' \
  | node scripts/hooks/claude-post-validate-web-css.mjs; echo "exit=$?"

# valid CSS -> expect exit 0, no output
printf '.x { color: red; }\n' > apps/web/__hooktest__.css
printf '{"tool_name":"Write","tool_input":{"file_path":"apps/web/__hooktest__.css"}}' \
  | node scripts/hooks/claude-post-validate-web-css.mjs; echo "exit=$?"

# non-CSS file -> expect exit 0 (ignored)
printf '{"tool_name":"Write","tool_input":{"file_path":"apps/web/package.json"}}' \
  | node scripts/hooks/claude-post-validate-web-css.mjs; echo "exit=$?"

rm -f apps/web/__hooktest__.css
```

Expected: first → `{"decision":"block",...}` then `exit=2`; second → `exit=0`; third → `exit=0`.

- [ ] **Step 4: Commit**

```bash
git add scripts/web-css-syntax.mjs scripts/hooks/claude-post-validate-web-css.mjs
git commit -m "feat(hooks): add Claude PostToolUse web-CSS validator"
```

---

## Task 2: Register Claude in the hook registry (TDD) + regenerate adapters

**Files:**
- Modify: `scripts/hooks/hook-registry.test.mjs` (3 expected lists)
- Modify: `scripts/hooks/registry.mjs` (add `claude` entry)
- Modify: `.gitignore` (ignore `.claude/settings.local.json`)
- Generate: `.claude/settings.json` (committed); `.codex/hooks.json`, `.cursor/hooks.json` unchanged

- [ ] **Step 1: Update the failing assertions in `scripts/hooks/hook-registry.test.mjs`**

Add `".claude/settings.json"` to the three hardcoded path lists:

In the first test (around line 33-36):
```js
  assert.deepEqual(
    AGENT_HOOK_CONFIG_FILES.map((hookFile) => hookFile.path),
    [".codex/hooks.json", ".cursor/hooks.json", ".claude/settings.json"],
  );
```

In the sync test (around line 49-52):
```js
    assert.deepEqual(syncAgentHookConfigs(repoRoot), [
      ".codex/hooks.json",
      ".cursor/hooks.json",
      ".claude/settings.json",
    ]);
```

In the audit assertion (around line 61-70):
```js
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
```

- [ ] **Step 2: Run the registry test to verify it fails**

Run: `npm run test:hooks`
Expected: FAIL — `hook-registry.test.mjs` assertions report missing `.claude/settings.json`.

- [ ] **Step 3: Add the `claude` entry to `scripts/hooks/registry.mjs`**

Append this object inside the `AGENT_HOOK_CONFIG_FILES` array, after the `cursor` entry (after the closing `}),` near line 59):

```js
  Object.freeze({
    tool: "claude",
    path: ".claude/settings.json",
    config: Object.freeze({
      hooks: Object.freeze({
        PostToolUse: Object.freeze([
          Object.freeze({
            matcher: "Write|Edit|MultiEdit",
            hooks: Object.freeze([
              Object.freeze({
                type: "command",
                command: repoRootNodeHookCommand(
                  "scripts/hooks/claude-post-validate-web-css.mjs",
                ),
              }),
            ]),
          }),
        ]),
      }),
    }),
  }),
```

- [ ] **Step 4: Run the registry test to verify it passes**

Run: `npm run test:hooks`
Expected: PASS (all tests).

- [ ] **Step 5: Regenerate the agent hook adapter files**

Run: `npm run hooks:sync`
Expected output lists `.codex/hooks.json`, `.cursor/hooks.json`, `.claude/settings.json`.
Then confirm only `.claude/settings.json` is new and the other two are unchanged:

```bash
git status --short .codex/hooks.json .cursor/hooks.json .claude/settings.json
```
Expected: `.claude/settings.json` untracked/new; the other two show no change.

- [ ] **Step 6: Audit hook configuration**

Run: `npm run hooks:audit`
Expected: `Hook configuration matches scripts/hooks/registry.mjs.` (the agent-file portion includes `.claude/settings.json: ok`). The Git-hook portion may report mismatch if config-based hooks are not installed locally — that is unrelated to this change and can be ignored, or run `npm run hooks:install` to install them.

- [ ] **Step 7: Ignore the personal Claude settings override in `.gitignore`**

Under the `# OS / IDE` block (next to `AGENTS.override.md`, around line 41), add:
```
.claude/settings.local.json
```

- [ ] **Step 8: Commit**

```bash
git add scripts/hooks/registry.mjs scripts/hooks/hook-registry.test.mjs .claude/settings.json .gitignore
git commit -m "feat(hooks): wire Claude Code into the hook registry"
```

---

## Task 3: Skills — neutral source + symlink linker (TDD)

**Files:**
- Move: `.codex-local/skills/` → `.agent-local/skills/` (untracked; plain `mv`)
- Modify: `.agent-local/skills/lilink-local-ops/SKILL.md` (lines 17, 40: `.codex-local` → `.agent-local`)
- Modify: `.agent-local/skills/lilink-local-ops/scripts/local_ops.mjs` (line 16: `.codex-local` → `.agent-local`)
- Create: `scripts/agent-skills-link.mjs`
- Create: `scripts/agent-skills-link.test.mjs`
- Modify: `package.json` (`skills:link` script; add linker test to `test:hooks`)
- Modify: `.gitignore` (`.codex-local/`→`.agent-local/`, add `.codex/skills/`, `.claude/skills/`)

- [ ] **Step 1: Move the skills to the neutral local directory**

```bash
mkdir -p .agent-local
mv .codex-local/skills .agent-local/skills
ls .agent-local/skills
```
Expected: `lilink-local-ops  lilink-ssh-environment`.

- [ ] **Step 2: Update path references inside the moved skill**

In `.agent-local/skills/lilink-local-ops/SKILL.md`:
- Line 17: `node .codex-local/skills/lilink-local-ops/scripts/local_ops.mjs <mode>` → `node .agent-local/skills/lilink-local-ops/scripts/local_ops.mjs <mode>`
- Line 40: ``- Everything under `.codex-local/` is local-only.`` → ``- Everything under `.agent-local/` is local-only.``

In `.agent-local/skills/lilink-local-ops/scripts/local_ops.mjs`:
- Line 16: `    ".codex-local",` → `    ".agent-local",`

(`local_ops.mjs` line 9 computes `repoRoot` by going up 4 directory levels; the directory depth is unchanged by the rename, so it stays correct.)

- [ ] **Step 3: Write the failing linker test `scripts/agent-skills-link.test.mjs`**

```js
import assert from "node:assert/strict";
import { lstatSync, mkdirSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
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
    assert.equal(second.every((r) => r.outcome === "ok"), true);
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
    const claudeResult = results.find((r) => r.link === ".claude/skills/demo");
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
```

- [ ] **Step 4: Run the linker test to verify it fails**

Run: `node --test scripts/agent-skills-link.test.mjs`
Expected: FAIL — `Cannot find module './agent-skills-link.mjs'` (or import error).

- [ ] **Step 5: Create `scripts/agent-skills-link.mjs`**

```js
#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SKILL_SOURCE_DIR = ".agent-local/skills";
const TOOL_SKILL_DIRS = [".codex/skills", ".claude/skills"];

export function getRepoRoot() {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

export function linkAgentSkills(repoRoot = getRepoRoot()) {
  const sourceRoot = path.join(repoRoot, SKILL_SOURCE_DIR);
  const results = [];

  if (!existsSync(sourceRoot)) {
    return results;
  }

  const skillNames = readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const toolDir of TOOL_SKILL_DIRS) {
    const toolRoot = path.join(repoRoot, toolDir);
    mkdirSync(toolRoot, { recursive: true });

    for (const name of skillNames) {
      const linkPath = path.join(toolRoot, name);
      const target = path
        .relative(toolRoot, path.join(sourceRoot, name))
        .split(path.sep)
        .join("/");
      results.push({
        link: `${toolDir}/${name}`,
        target,
        outcome: ensureSymlink(linkPath, target),
      });
    }
  }

  return results;
}

function ensureSymlink(linkPath, target) {
  let stat = null;
  try {
    stat = lstatSync(linkPath);
  } catch {
    stat = null;
  }

  if (stat) {
    if (!stat.isSymbolicLink()) {
      return "skipped-real-path";
    }
    if (readlinkSync(linkPath) === target) {
      return "ok";
    }
    rmSync(linkPath);
  }

  symlinkSync(target, linkPath);
  return "linked";
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const results = linkAgentSkills();
    if (results.length === 0) {
      console.log(
        "No skills found under .agent-local/skills — nothing to link.",
      );
    } else {
      console.log("Linked agent skills:");
      for (const result of results) {
        console.log(`- ${result.link} -> ${result.target} [${result.outcome}]`);
      }
      const skipped = results.filter(
        (result) => result.outcome === "skipped-real-path",
      );
      if (skipped.length > 0) {
        console.warn(
          "Warning: left untouched (real path, not a symlink):",
        );
        for (const result of skipped) {
          console.warn(`- ${result.link}`);
        }
      }
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
```

- [ ] **Step 6: Run the linker test to verify it passes**

Run: `node --test scripts/agent-skills-link.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 7: Add the `skills:link` script and wire the test into `test:hooks` in `package.json`**

Add to `scripts`:
```json
    "skills:link": "node scripts/agent-skills-link.mjs",
```
Change the existing `test:hooks` line to also run the linker test:
```json
    "test:hooks": "node --test scripts/install-git-hooks.test.mjs scripts/hooks/hook-registry.test.mjs scripts/agent-skills-link.test.mjs",
```

- [ ] **Step 8: Run the full hook/skill test bucket**

Run: `npm run test:hooks`
Expected: PASS (registry tests + install-git-hooks tests + 4 linker tests).

- [ ] **Step 9: Update `.gitignore` for the neutral source and symlink dirs**

- Change line 5 `.codex-local/` → `.agent-local/`
- Under `# OS / IDE` (or alongside the new `.claude/settings.local.json`), add:
```
.codex/skills/
.claude/skills/
```

- [ ] **Step 10: Commit**

```bash
git add scripts/agent-skills-link.mjs scripts/agent-skills-link.test.mjs package.json .gitignore
git commit -m "feat(skills): add neutral local skills source + project-level linker"
```

---

## Task 4: Run the linker, clean scratch and empty dirs (local FS only — no commit)

These changes are entirely under gitignored/untracked paths, so they produce no Git diff.

- [ ] **Step 1: Create the per-tool skill symlinks**

Run: `npm run skills:link`
Expected: lists `.codex/skills/lilink-local-ops`, `.codex/skills/lilink-ssh-environment`, `.claude/skills/lilink-local-ops`, `.claude/skills/lilink-ssh-environment` each `[linked]`.

- [ ] **Step 2: Verify symlinks resolve to the neutral source**

```bash
ls -l .codex/skills .claude/skills
cat .claude/skills/lilink-local-ops/SKILL.md | head -3
```
Expected: symlinks point to `../../.agent-local/skills/<name>`; the `SKILL.md` content is readable through the link.

- [ ] **Step 3: Remove the old codex-local directory and empty hook dirs**

```bash
rm -rf .codex-local
rmdir .codex/hooks .codex/tmp .cursor/hooks 2>/dev/null || true
ls -la .codex .cursor
```
Expected: `.codex-local` gone; `.codex` contains `hooks.json` + `skills/`; `.cursor` contains `hooks.json`; no empty `hooks/`/`tmp/` dirs.

- [ ] **Step 4: Confirm no unexpected Git changes from this task**

Run: `git status --short`
Expected: nothing from `.agent-local`, `.codex/skills`, `.claude/skills`, or `.codex-local` (all gitignored). Only previously-staged/committed work and any pre-existing unrelated working-tree changes remain.

---

## Task 5: Documentation — update `AGENTS.md` only

**Files:**
- Modify: `AGENTS.md` (Hook Management, new Skills section, Git Hygiene paths)

- [ ] **Step 1: Update the Hook Management section**

Replace the bullet:
```
- Treat `.codex/hooks.json` and `.cursor/hooks.json` as generated adapter files for Codex and Cursor. Do not edit them directly; run `npm run hooks:sync` after registry changes.
```
with:
```
- Treat `.codex/hooks.json`, `.cursor/hooks.json`, and `.claude/settings.json` as generated adapter files for Codex, Cursor, and Claude Code. Do not edit them directly; run `npm run hooks:sync` after registry changes.
- To register a new hook: add it to `scripts/hooks/registry.mjs` (a `GIT_HOOK_CONFIGS` entry for a Git hook, or an `AGENT_HOOK_CONFIG_FILES` entry for an agent adapter), then run `npm run hooks:sync` (or `npm run hooks:install`) and commit the regenerated files.
- `.claude/settings.json` is generated and committed; put personal Claude settings in `.claude/settings.local.json` (gitignored), not in `settings.json`.
```

- [ ] **Step 2: Add a Skills section after Hook Management**

```markdown
## Skills

- Personal agent skills live under `.agent-local/skills/<name>/SKILL.md` and are gitignored — they are per-developer, not team-shared.
- Run `npm run skills:link` to create project-level symlinks (`.codex/skills/<name>`, `.claude/skills/<name>`) so Codex and Claude Code auto-discover them from the single source. The command is idempotent and is a no-op when `.agent-local/skills` is absent.
- Cursor has no SKILL.md system; it reads rules from `AGENTS.md` and `.cursor/rules`.
```

- [ ] **Step 3: Update the Git Hygiene local-only files bullet**

Replace `.codex-local/` references and add the new gitignored paths:
```
- Do not commit local-only files such as `.env`, `.env.*`, `AGENTS.override.md`, `.agent-local/`, `.codex/skills/`, `.claude/skills/`, `.claude/settings.local.json`, build output, dependency folders, or logs.
```

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): document Claude hooks + unified skills layout"
```

---

## Task 6: Final verification

- [ ] **Step 1: Hook configuration in sync**

Run: `npm run hooks:audit`
Expected: agent-file portion all `ok` (including `.claude/settings.json`).

- [ ] **Step 2: All agent-config tests pass**

Run: `npm run test:hooks`
Expected: PASS.

- [ ] **Step 3: End-to-end Claude hook block check**

```bash
printf '.x { color: red; ' > apps/web/__hooktest__.css
printf '{"tool_name":"Edit","tool_input":{"file_path":"apps/web/__hooktest__.css"}}' \
  | node scripts/hooks/claude-post-validate-web-css.mjs; echo "exit=$?"
rm -f apps/web/__hooktest__.css
```
Expected: prints block JSON, `exit=2`.

- [ ] **Step 4: Review the full diff of committed changes**

```bash
git diff --stat main...HEAD -- scripts AGENTS.md package.json .gitignore .claude/settings.json docs/superpowers
git diff main...HEAD -- .gitignore AGENTS.md package.json
```
Confirm: `.claude/settings.json` tracked; `.codex/hooks.json`/`.cursor/hooks.json` unchanged; no `.agent-local`/skills symlinks staged; rules content in `AGENTS.md` otherwise unchanged.

- [ ] **Step 5: Restart agents to pick up changes (manual, by the developer)**

Note: Codex and Claude Code discover the new skills on next start. Mention this to the user; do not attempt to restart their tools.

---

## Self-Review (against the spec)

**Spec coverage:**
- §5.1 Hooks/Claude → Task 1 (validator + adapter) + Task 2 (registry entry, regenerate, settings.local ignore). ✓
- §5.2 Skills unified → Task 3 (neutral source move, path refs, linker + test, npm script) + Task 4 Step 1-2 (link + verify). ✓
- §5.3 Cleanup → Task 4 Step 3 (rm scratch + empty dirs). ✓
- §5.4 .gitignore → Task 2 Step 7 (`settings.local.json`) + Task 3 Step 9 (`.agent-local/`, `.codex/skills/`, `.claude/skills/`). ✓
- §5.5 AGENTS.md → Task 5. ✓
- §6 Verification → Task 6. ✓

**Placeholder scan:** No TBD/TODO; every code/edit step shows concrete content; commands have expected output.

**Type/name consistency:** `linkAgentSkills(repoRoot)` returns `[{ link, target, outcome }]` with `outcome ∈ {linked, ok, skipped-real-path}` — used consistently in the linker, its tests, and the CLI block. `validateClaudePostToolUse` returns `{ ok }` or `{ ok:false, reason, hookStdout }` — consumed exactly by the adapter. Registry path `.claude/settings.json` matches the test assertions and the AGENTS.md text.

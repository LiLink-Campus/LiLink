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
        console.warn("Warning: left untouched (real path, not a symlink):");
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

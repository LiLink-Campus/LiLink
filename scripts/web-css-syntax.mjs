#!/usr/bin/env node

import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let postcssModule = null;

export function getRepoRoot(fromDir = process.cwd()) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      cwd: fromDir,
      windowsHide: true,
    }).trim();
  } catch {
    return path.resolve(__dirname, "..");
  }
}

export function loadPostcss(repoRoot) {
  if (postcssModule) {
    return postcssModule;
  }

  const require = createRequire(import.meta.url);
  const candidates = [
    path.join(repoRoot, "apps/web/node_modules/postcss"),
    path.join(repoRoot, "node_modules/postcss"),
  ];

  for (const postcssPath of candidates) {
    if (existsSync(postcssPath)) {
      postcssModule = require(postcssPath);
      return postcssModule;
    }
  }

  throw new Error(
    `PostCSS not found under ${repoRoot}. Run npm install from the repository root.`,
  );
}

export function normalizeToRepoRel(repoRoot, filePath) {
  const abs = path.isAbsolute(filePath)
    ? path.normalize(filePath)
    : path.normalize(path.resolve(process.cwd(), filePath));
  const rel = path.relative(repoRoot, abs);
  return rel.split(path.sep).join("/");
}

export function isWebAppCss(relPath) {
  const forward = relPath.replace(/\\/g, "/");
  return (
    forward.startsWith("apps/web/") &&
    forward.endsWith(".css") &&
    !forward.includes("node_modules")
  );
}

export function validateCssString(postcss, source, label) {
  postcss.parse(source, { from: label });
}

export function validateFile(repoRoot, postcss, absPath) {
  const src = readFileSync(absPath, "utf8");
  validateCssString(postcss, src, absPath);
}

export function findDefaultCssFiles(repoRoot) {
  const webRoot = path.join(repoRoot, "apps", "web");
  if (!existsSync(webRoot)) {
    return [];
  }

  const files = [];
  const stack = [webRoot];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next") {
        continue;
      }

      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(abs);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".css")) {
        files.push(abs);
      }
    }
  }

  return files.sort();
}

export function extractApplyPatchTargets(patchText) {
  if (typeof patchText !== "string") {
    return [];
  }

  const paths = [];
  const re = /^\*{3} (?:Add|Update) File:\s*(.+)$/gm;
  let match = null;

  while ((match = re.exec(patchText)) !== null) {
    paths.push(match[1].trim());
  }

  return paths;
}

function toolInputPath(input) {
  if (!input || typeof input !== "object") {
    return null;
  }

  return (
    input.path ??
    input.file_path ??
    input.filePath ??
    input.target_file ??
    input.targetFile ??
    null
  );
}

function toolInputContents(input) {
  if (!input || typeof input !== "object") {
    return null;
  }

  return input.contents ?? input.content ?? null;
}

function toolInputReplace(input) {
  if (!input || typeof input !== "object") {
    return null;
  }

  const oldStr = input.old_string ?? input.oldString ?? input.old_str ?? input.oldStr;
  const newStr = input.new_string ?? input.newString ?? input.new_str ?? input.newStr;

  if (oldStr == null || newStr == null) {
    return null;
  }

  return { oldStr: String(oldStr), newStr: String(newStr) };
}

export function validateCursorPreToolUse(payload, repoRoot) {
  const toolName = payload.tool_name;
  const toolInput = payload.tool_input;
  const cwd = payload.cwd ?? repoRoot;

  const relPathRaw = toolInputPath(toolInput);
  if (!relPathRaw) {
    return { permission: "allow" };
  }

  const absPath = path.isAbsolute(relPathRaw)
    ? path.normalize(relPathRaw)
    : path.normalize(path.join(cwd, relPathRaw));
  const rel = normalizeToRepoRel(repoRoot, absPath);

  if (!isWebAppCss(rel)) {
    return { permission: "allow" };
  }

  const postcss = loadPostcss(repoRoot);

  try {
    if (toolName === "Write") {
      const contents = toolInputContents(toolInput);
      if (typeof contents !== "string") {
        return { permission: "allow" };
      }

      validateCssString(postcss, contents, rel);
      return { permission: "allow" };
    }

    const replace = toolInputReplace(toolInput);
    if (replace && existsSync(absPath)) {
      let text = readFileSync(absPath, "utf8");
      if (text.includes(replace.oldStr)) {
        text = text.replace(replace.oldStr, replace.newStr);
        validateCssString(postcss, text, rel);
      }
    }

    return { permission: "allow" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      permission: "deny",
      user_message: `${rel}: ${message}`,
      agent_message: `Blocked edit: invalid CSS in ${rel}. ${message}`,
    };
  }
}

export function validateCodexAfterApplyPatch(payload, repoRoot) {
  const toolInput = payload.tool_input;
  const command = toolInput?.command;

  let patchText = command;
  if (Array.isArray(command)) {
    patchText = command.join("\n");
  }

  if (typeof patchText !== "string") {
    return { ok: true };
  }

  const postcss = loadPostcss(repoRoot);
  const targets = extractApplyPatchTargets(patchText);
  const failures = [];

  for (const raw of targets) {
    const abs = path.isAbsolute(raw)
      ? path.normalize(raw)
      : path.normalize(path.join(repoRoot, raw.replace(/\//g, path.sep)));
    const rel = normalizeToRepoRel(repoRoot, abs);

    if (!isWebAppCss(rel) || !existsSync(abs)) {
      continue;
    }

    try {
      validateFile(repoRoot, postcss, abs);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${rel}: ${message}`);
    }
  }

  if (failures.length === 0) {
    return { ok: true };
  }

  const reason = failures.join("\n");
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

function runCli() {
  const repoRoot = getRepoRoot();
  const postcss = loadPostcss(repoRoot);
  const files =
    process.argv.length > 2 ? process.argv.slice(2) : findDefaultCssFiles(repoRoot);

  let failed = false;

  for (const file of files) {
    const abs = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
    const rel = normalizeToRepoRel(repoRoot, abs);

    if (!isWebAppCss(rel)) {
      console.error(`skip not apps/web css: ${rel}`);
      continue;
    }

    try {
      validateFile(repoRoot, postcss, abs);
    } catch (error) {
      failed = true;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${rel}: ${message}`);
    }
  }

  process.exitCode = failed ? 1 : 0;
}

const isMain = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runCli();
}

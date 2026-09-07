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

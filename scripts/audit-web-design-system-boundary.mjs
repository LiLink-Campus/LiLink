#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const IGNORED_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "docs",
  "node_modules",
  "out",
]);

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const CSS_EXTENSIONS = new Set([".css"]);
const DEFAULT_MAX_FINDINGS = 80;

const BANNED_CLASS_EXACT = new Set([
  "auth-form",
  "content-panel",
  "domain-chip",
  "form-error",
  "form-success",
]);

const BANNED_CLASS_PREFIX_ONLY = ["button-"];

const BANNED_CLASS_FAMILIES = [
  "admin-tab",
  "app-card",
  "mc-btn",
  "mc-card",
  "mc-input",
];

const BANNED_TOKEN_FAMILIES = [
  "--accent",
  "--bg",
  "--border",
  "--fg",
  "--primary",
  "--success",
  "--warning",
];

const DESIGN_SYSTEM_SELECTOR_FILES = new Set([
  "apps/web/src/styles/primitives.css",
  "apps/web/src/styles/semantic.css",
]);

function getRepoRoot(fromDir = process.cwd()) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: fromDir,
      encoding: "utf8",
      windowsHide: true,
    }).trim();
  } catch {
    return path.resolve(__dirname, "..");
  }
}

function normalizeRel(repoRoot, filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function hasIgnoredSegment(repoRoot, filePath) {
  const rel = normalizeRel(repoRoot, filePath);
  if (rel === "") {
    return false;
  }

  return rel.split("/").some((segment) => IGNORED_DIRS.has(segment));
}

function collectFiles(repoRoot, inputs) {
  const files = [];
  const stack = inputs.length > 0 ? [...inputs] : [repoRoot];

  while (stack.length > 0) {
    const current = path.resolve(stack.pop());

    if (!existsSync(current) || hasIgnoredSegment(repoRoot, current)) {
      continue;
    }

    const stat = statSync(current);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) {
          continue;
        }

        stack.push(path.join(current, entry.name));
      }
      continue;
    }

    if (!stat.isFile()) {
      continue;
    }

    const extension = path.extname(current);
    if (SOURCE_EXTENSIONS.has(extension) || CSS_EXTENSIONS.has(extension)) {
      files.push(current);
    }
  }

  return files.sort();
}

function buildLineStarts(source) {
  const starts = [0];

  for (let i = 0; i < source.length; i += 1) {
    if (source.charCodeAt(i) === 10) {
      starts.push(i + 1);
    }
  }

  return starts;
}

function locationForIndex(lineStarts, index) {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= index) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const lineIndex = Math.max(0, high);
  return {
    line: lineIndex + 1,
    column: index - lineStarts[lineIndex] + 1,
  };
}

function isBannedClassName(className) {
  if (BANNED_CLASS_EXACT.has(className)) {
    return true;
  }

  if (BANNED_CLASS_PREFIX_ONLY.some((prefix) => className.startsWith(prefix))) {
    return true;
  }

  return BANNED_CLASS_FAMILIES.some(
    (family) => className === family || className.startsWith(`${family}-`),
  );
}

function isBannedToken(tokenName) {
  return BANNED_TOKEN_FAMILIES.some(
    (family) => tokenName === family || tokenName.startsWith(`${family}-`),
  );
}

function scanStringSpans(source) {
  const spans = [];
  let i = 0;

  while (i < source.length) {
    const char = source[i];

    if (char === "\"" || char === "'" || char === "`") {
      const quote = char;
      const start = i + 1;
      i = start;

      while (i < source.length) {
        if (source[i] === "\\") {
          i += 2;
          continue;
        }

        if (source[i] === quote) {
          spans.push({ start, end: i });
          i += 1;
          break;
        }

        i += 1;
      }

      continue;
    }

    i += 1;
  }

  return spans;
}

function scanSourceFile(repoRoot, filePath) {
  const source = readFileSync(filePath, "utf8");
  const lineStarts = buildLineStarts(source);
  const findings = [];
  const classTokenPattern = /[A-Za-z_][A-Za-z0-9_-]*/g;

  for (const span of scanStringSpans(source)) {
    const rawString = source.slice(span.start, span.end);
    let match = null;

    while ((match = classTokenPattern.exec(rawString)) !== null) {
      const className = match[0];
      if (!isBannedClassName(className)) {
        continue;
      }

      const index = span.start + match.index;
      findings.push({
        kind: "class",
        relPath: normalizeRel(repoRoot, filePath),
        ...locationForIndex(lineStarts, index),
        match: className,
        message: `banned primitive class "${className}"`,
      });
    }
  }

  return findings;
}

function scanCssFile(repoRoot, filePath) {
  const source = readFileSync(filePath, "utf8");
  const lineStarts = buildLineStarts(source);
  const findings = [];
  const relPath = normalizeRel(repoRoot, filePath);

  const reportToken = (tokenName, index) => {
    if (!isBannedToken(tokenName)) {
      return;
    }

    findings.push({
      kind: "token",
      relPath,
      ...locationForIndex(lineStarts, index),
      match: tokenName,
      message: `banned legacy CSS token "${tokenName}"`,
    });
  };

  const customPropertyDefinitionPattern = /(?<![A-Za-z0-9_-])(--[A-Za-z0-9_-]+)\s*:/g;
  let match = null;

  while ((match = customPropertyDefinitionPattern.exec(source)) !== null) {
    reportToken(match[1], match.index);
  }

  const varReferencePattern = /var\(\s*(--[A-Za-z0-9_-]+)/g;
  while ((match = varReferencePattern.exec(source)) !== null) {
    reportToken(match[1], match.index + match[0].indexOf(match[1]));
  }

  if (!DESIGN_SYSTEM_SELECTOR_FILES.has(relPath)) {
    const rootDesignSelectorPattern = /^[ \t]*\.(?:ui|semantic)-[A-Za-z0-9_-]+/gm;
    while ((match = rootDesignSelectorPattern.exec(source)) !== null) {
      findings.push({
        kind: "selector",
        relPath,
        ...locationForIndex(lineStarts, match.index),
        match: match[0].trim(),
        message: `design-system selector "${match[0].trim()}" must live in apps/web/src/styles`,
      });
    }
  }

  return findings;
}

export function auditWebDesignSystemBoundary(repoRoot = getRepoRoot(), inputs = []) {
  const files = collectFiles(repoRoot, inputs);
  const findings = [];

  for (const filePath of files) {
    const extension = path.extname(filePath);

    if (SOURCE_EXTENSIONS.has(extension)) {
      findings.push(...scanSourceFile(repoRoot, filePath));
    } else if (CSS_EXTENSIONS.has(extension)) {
      findings.push(...scanCssFile(repoRoot, filePath));
    }
  }

  return findings.sort((a, b) => {
    if (a.relPath !== b.relPath) {
      return a.relPath.localeCompare(b.relPath);
    }

    if (a.line !== b.line) {
      return a.line - b.line;
    }

    return a.column - b.column;
  });
}

function parseArgs(args) {
  const inputs = [];
  let maxFindings = DEFAULT_MAX_FINDINGS;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      return { help: true, inputs, maxFindings };
    }

    if (arg === "--max-findings") {
      const raw = args[i + 1];
      i += 1;
      maxFindings = Number.parseInt(raw, 10);
      continue;
    }

    if (arg.startsWith("--max-findings=")) {
      maxFindings = Number.parseInt(arg.slice("--max-findings=".length), 10);
      continue;
    }

    inputs.push(arg);
  }

  if (!Number.isFinite(maxFindings) || maxFindings < 1) {
    maxFindings = DEFAULT_MAX_FINDINGS;
  }

  return { help: false, inputs, maxFindings };
}

function printHelp() {
  console.log(`Usage: node scripts/audit-web-design-system-boundary.mjs [paths...] [--max-findings N]

Fails when TS/TSX string literals contain legacy primitive class names or CSS
files contain legacy global design tokens. Ignored directories include docs,
node_modules, .next, dist, build, out, coverage, .turbo, and .vercel.`);
}

function runCli() {
  const { help, inputs, maxFindings } = parseArgs(process.argv.slice(2));

  if (help) {
    printHelp();
    return;
  }

  const repoRoot = getRepoRoot();
  const absoluteInputs = inputs.map((input) =>
    path.isAbsolute(input) ? input : path.resolve(process.cwd(), input),
  );
  const findings = auditWebDesignSystemBoundary(repoRoot, absoluteInputs);

  if (findings.length === 0) {
    console.log("Web design-system boundary audit passed.");
    return;
  }

  const classCount = findings.filter((finding) => finding.kind === "class").length;
  const tokenCount = findings.filter((finding) => finding.kind === "token").length;
  const selectorCount = findings.length - classCount - tokenCount;

  console.error(
    `Web design-system boundary audit failed: ${findings.length} violation(s) ` +
      `(${classCount} class, ${tokenCount} token, ${selectorCount} selector).`,
  );

  for (const finding of findings.slice(0, maxFindings)) {
    console.error(
      `${finding.relPath}:${finding.line}:${finding.column} ${finding.message}`,
    );
  }

  if (findings.length > maxFindings) {
    console.error(`... and ${findings.length - maxFindings} more.`);
  }

  process.exitCode = 1;
}

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMain) {
  runCli();
}

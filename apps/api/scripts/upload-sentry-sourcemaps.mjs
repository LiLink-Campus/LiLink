import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadMonorepoEnv } from "./load-env.mjs";

loadMonorepoEnv();

const sentryAuthToken = resolveSentryAuthToken();
if (sentryAuthToken) {
  process.env.SENTRY_AUTH_TOKEN = sentryAuthToken;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(apiRoot, "..", "..");
const distDir = path.join(apiRoot, "dist");
const releaseFilePath = path.join(distDir, ".sentry-release");

const requiredEnvNames = [
  "SENTRY_AUTH_TOKEN",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
];

const release = resolveSentryRelease();
if (release) {
  process.env.SENTRY_RELEASE = release;
}

const missingEnvNames = [
  ...requiredEnvNames.filter((name) => !process.env[name]?.trim()),
  ...(release ? [] : ["SENTRY_RELEASE"]),
];
const requireUpload = process.env.SENTRY_REQUIRE_SOURCEMAPS === "true";

if (existsSync(distDir) && release) {
  mkdirSync(distDir, { recursive: true });
  writeFileSync(releaseFilePath, `${release}\n`, "utf8");
  console.log(`Resolved Sentry API release ${release}.`);
}

if (missingEnvNames.length > 0) {
  const message = `Skipping Sentry API sourcemap upload; missing ${missingEnvNames.join(
    ", ",
  )}.`;

  if (requireUpload) {
    console.error(message);
    process.exit(1);
  }

  console.log(message);
  process.exit(0);
}

if (!existsSync(distDir)) {
  console.error(
    `Cannot upload Sentry API sourcemaps because ${distDir} does not exist.`,
  );
  process.exit(1);
}

function runSentryCli(args) {
  const result = spawnSync("sentry-cli", args, {
    cwd: apiRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(`Failed to start sentry-cli: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

runSentryCli(["sourcemaps", "inject", distDir]);

const uploadArgs = [
  "sourcemaps",
  "upload",
  "--org",
  process.env.SENTRY_ORG.trim(),
  "--project",
  process.env.SENTRY_PROJECT.trim(),
  "--release",
  process.env.SENTRY_RELEASE.trim(),
  "--strip-prefix",
  apiRoot,
];

const sentryDist = process.env.SENTRY_DIST?.trim();
if (sentryDist) {
  uploadArgs.push("--dist", sentryDist);
}

uploadArgs.push(distDir);

runSentryCli(uploadArgs);

function resolveSentryRelease() {
  const configuredRelease = process.env.SENTRY_RELEASE?.trim();
  if (configuredRelease) {
    return configuredRelease;
  }

  for (const envName of [
    "GITHUB_SHA",
    "VERCEL_GIT_COMMIT_SHA",
    "GIT_COMMIT_SHA",
    "COMMIT_SHA",
    "SOURCE_VERSION",
  ]) {
    const value = process.env[envName]?.trim();
    if (isCommitSha(value)) {
      return value;
    }
  }

  return readGitHeadCommitSha(repoRoot);
}

function resolveSentryAuthToken() {
  const configuredToken = process.env.SENTRY_AUTH_TOKEN?.trim();
  if (configuredToken) {
    return configuredToken;
  }

  const tokenFilePath = process.env.SENTRY_AUTH_TOKEN_FILE?.trim();
  if (!tokenFilePath) {
    return "";
  }

  return readTextIfExists(tokenFilePath).trim();
}

function readGitHeadCommitSha(rootDir) {
  const gitDir = resolveGitDir(rootDir);
  if (!gitDir) {
    return "";
  }

  const head = readTextIfExists(path.join(gitDir, "HEAD")).trim();
  if (!head) {
    return "";
  }

  if (isCommitSha(head)) {
    return head;
  }

  const refMatch = /^ref:\s*(.+)$/.exec(head);
  const refName = refMatch?.[1]?.trim();
  if (!refName) {
    return "";
  }

  const looseRef = readTextIfExists(path.join(gitDir, refName)).trim();
  if (isCommitSha(looseRef)) {
    return looseRef;
  }

  const packedRefs = readTextIfExists(path.join(gitDir, "packed-refs"));
  for (const line of packedRefs.split("\n")) {
    if (!line || line.startsWith("#") || line.startsWith("^")) {
      continue;
    }
    const [sha, packedRefName] = line.trim().split(/\s+/, 2);
    if (packedRefName === refName && isCommitSha(sha)) {
      return sha;
    }
  }

  return "";
}

function resolveGitDir(rootDir) {
  const gitPath = path.join(rootDir, ".git");
  if (!existsSync(gitPath)) {
    return "";
  }

  try {
    const maybeGitFile = readFileSync(gitPath, "utf8");
    const match = /^gitdir:\s*(.+)$/m.exec(maybeGitFile);
    if (match?.[1]) {
      return path.resolve(rootDir, match[1].trim());
    }
  } catch {
    return gitPath;
  }

  return gitPath;
}

function readTextIfExists(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function isCommitSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

#!/usr/bin/env node
// Publish captured Storybook screenshots as PR evidence: pushes the
// screenshot directory to a storybook-evidence/pr-<number> branch and
// creates or updates a sticky PR comment linking each capture.
//
// Intended for agents/developers after a targeted capture, e.g.:
//   STORYBOOK_SCREENSHOT_STORIES=mode-select npm run screenshots:storybook:web
//   node scripts/post-storybook-evidence.mjs --pr 89
//
// Requires an authenticated `gh` CLI and push access to the repository.
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const outputDir = path.resolve(
  repoRoot,
  process.env.STORYBOOK_SCREENSHOT_OUT || "artifacts/storybook-screenshots",
);

const MARKER = "<!-- storybook-visual-evidence -->";

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  }).trim();
}

function parsePrNumber() {
  const index = process.argv.indexOf("--pr");
  if (index !== -1 && process.argv[index + 1]) {
    const value = Number.parseInt(process.argv[index + 1], 10);
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`Invalid --pr value: ${process.argv[index + 1]}`);
    }
    return value;
  }
  const inferred = run("gh", ["pr", "view", "--json", "number", "--jq", ".number"]);
  if (!inferred) {
    throw new Error(
      "Unable to infer the PR number from the current branch. Pass --pr <number>.",
    );
  }
  return Number.parseInt(inferred, 10);
}

async function pushEvidenceBranch(prNumber, repoSlug, headSha) {
  const branch = `storybook-evidence/pr-${prNumber}`;
  const remoteUrl = run("git", ["remote", "get-url", "origin"]);
  const gitDir = await mkdtemp(path.join(tmpdir(), "storybook-evidence-git-"));
  const git = (...args) =>
    run("git", ["--git-dir", gitDir, "--work-tree", outputDir, ...args]);

  try {
    git("init", "-q", "-b", branch);
    git("config", "user.name", "lilink-visual-evidence");
    git("config", "user.email", "noreply@lilink.local");
    git("add", "-A");
    git(
      "commit",
      "-qm",
      `Storybook evidence for PR #${prNumber} (${headSha})`,
    );
    git("push", "-qf", remoteUrl, `HEAD:refs/heads/${branch}`);
    return { branch, evidenceSha: git("rev-parse", "HEAD"), repoSlug };
  } finally {
    await rm(gitDir, { recursive: true, force: true });
  }
}

function buildComment(manifest, { repoSlug, evidenceSha, headSha }) {
  const { screenshots = [], failures = [] } = manifest;
  const filter =
    manifest.includeStories?.length > 0
      ? `stories: ${manifest.includeStories.join(", ")}`
      : `tags: ${(manifest.includeTags || []).join(", ")}`;
  const blobBase = `https://github.com/${repoSlug}/blob/${evidenceSha}`;

  const byStory = new Map();
  for (const screenshot of screenshots) {
    const key = `${screenshot.title} / ${screenshot.name}`;
    if (!byStory.has(key)) {
      byStory.set(key, []);
    }
    byStory.get(key).push(screenshot);
  }

  const lines = [
    MARKER,
    "## Storybook Visual Evidence",
    "",
    `Screenshots for \`${headSha.slice(0, 7)}\` (${filter}).`,
    "",
    "| Story | Screenshots |",
    "| --- | --- |",
  ];
  for (const [story, shots] of byStory) {
    const links = shots
      .map(
        (shot) =>
          `[${shot.viewport.name}](${blobBase}/${encodeURIComponent(path.basename(shot.file))})`,
      )
      .join(" · ");
    lines.push(`| ${story} | ${links} |`);
  }

  if (failures.length > 0) {
    lines.push("", "### Failed captures", "");
    for (const failure of failures) {
      lines.push(
        `- \`${failure.storyId}\` (${failure.viewport.name}): ${failure.error}`,
      );
    }
  }

  lines.push(
    "",
    "_Posted by `scripts/post-storybook-evidence.mjs`; rerunning it updates this comment._",
  );
  return `${lines.join("\n")}\n`;
}

async function upsertComment(prNumber, repoSlug, body) {
  const bodyFile = path.join(outputDir, "evidence-comment.md");
  await writeFile(bodyFile, body);
  const existingId = run("gh", [
    "api",
    `repos/${repoSlug}/issues/${prNumber}/comments`,
    "--paginate",
    "--jq",
    `[.[] | select(.body | startswith("${MARKER}")) | .id] | first // empty`,
  ]);
  if (existingId) {
    run("gh", [
      "api",
      "-X",
      "PATCH",
      `repos/${repoSlug}/issues/comments/${existingId}`,
      "-F",
      `body=@${bodyFile}`,
    ]);
    return "updated";
  }
  run("gh", [
    "api",
    `repos/${repoSlug}/issues/${prNumber}/comments`,
    "-F",
    `body=@${bodyFile}`,
  ]);
  return "created";
}

async function main() {
  const manifest = JSON.parse(
    await readFile(path.join(outputDir, "manifest.json"), "utf8").catch(() => {
      throw new Error(
        `No manifest at ${outputDir}. Run the screenshot capture first.`,
      );
    }),
  );
  if (!manifest.screenshots || manifest.screenshots.length === 0) {
    throw new Error(
      "Manifest contains no screenshots; capture the affected stories first.",
    );
  }

  const prNumber = parsePrNumber();
  const repoSlug = run("gh", [
    "repo",
    "view",
    "--json",
    "nameWithOwner",
    "--jq",
    ".nameWithOwner",
  ]);
  const headSha = run("git", ["rev-parse", "HEAD"]);

  console.log(`Publishing ${manifest.screenshots.length} screenshot(s) for PR #${prNumber}...`);
  const evidence = await pushEvidenceBranch(prNumber, repoSlug, headSha);
  const body = buildComment(manifest, { ...evidence, headSha });
  const action = await upsertComment(prNumber, repoSlug, body);
  console.log(
    `Evidence ${action} on PR #${prNumber} (branch ${evidence.branch} @ ${evidence.evidenceSha.slice(0, 7)}).`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

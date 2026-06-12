#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

const manifestPath =
  process.env.MANIFEST_PATH || "artifacts/storybook-screenshots/manifest.json";
const blobBaseUrl = process.env.EVIDENCE_BLOB_BASE_URL || "";
const runUrl = process.env.RUN_URL || "";
const headSha = process.env.HEAD_SHA || "";

const MARKER = "<!-- storybook-visual-evidence -->";

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const { screenshots = [], failures = [], includeTags = [] } = manifest;

function screenshotLink(screenshot) {
  const fileName = path.basename(screenshot.file);
  if (!blobBaseUrl) {
    return fileName;
  }
  return `[${screenshot.viewport.name}](${blobBaseUrl}/${encodeURIComponent(fileName)})`;
}

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
  `Screenshots for ${headSha ? `\`${headSha.slice(0, 7)}\`` : "this PR"} (tags: ${includeTags.join(", ") || "-"}).`,
  "",
];

if (byStory.size === 0 && failures.length === 0) {
  lines.push("_No stories matched the configured tags; nothing was captured._");
} else {
  lines.push("| Story | Screenshots |", "| --- | --- |");
  for (const [story, shots] of byStory) {
    lines.push(`| ${story} | ${shots.map(screenshotLink).join(" · ")} |`);
  }
}

if (failures.length > 0) {
  lines.push("", "### Failed captures", "");
  for (const failure of failures) {
    lines.push(`- \`${failure.storyId}\` (${failure.viewport.name}): ${failure.error}`);
  }
}

lines.push("");
if (runUrl) {
  lines.push(
    `Full-resolution artifact: [storybook-screenshots](${runUrl}#artifacts) (retained 14 days).`,
  );
}
lines.push(
  "_This comment is updated automatically by the Storybook Visual Evidence workflow._",
);

process.stdout.write(`${lines.join("\n")}\n`);

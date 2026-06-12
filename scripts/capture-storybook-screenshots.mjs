#!/usr/bin/env node
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const storybookDir = path.resolve(
  repoRoot,
  process.env.STORYBOOK_STATIC_DIR || "apps/web/storybook-static",
);
const outputDir = path.resolve(
  repoRoot,
  process.env.STORYBOOK_SCREENSHOT_OUT || "artifacts/storybook-screenshots",
);
const includeTags = (
  process.env.STORYBOOK_SCREENSHOT_TAGS || "smoke"
)
  .split(",")
  .map((tag) => tag.trim())
  .filter(Boolean);
const viewports = [
  { name: "desktop", width: 1280, height: 720 },
  { name: "mobile", width: 390, height: 844 },
];

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function sanitizeFilePart(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readStorybookIndex() {
  const indexPath = path.join(storybookDir, "index.json");
  if (!(await pathExists(indexPath))) {
    throw new Error(
      `Storybook index not found at ${indexPath}. Run npm run build-storybook:web first.`,
    );
  }

  const index = JSON.parse(await readFile(indexPath, "utf8"));
  const entries = Object.values(index.entries || index.stories || {});
  const stories = entries
    .filter((entry) => entry?.type === "story")
    .filter((entry) => {
      const tags = Array.isArray(entry.tags) ? entry.tags : [];
      return includeTags.every((tag) => tags.includes(tag));
    })
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));

  if (stories.length === 0) {
    throw new Error(
      `No Storybook stories found with tags: ${includeTags.join(", ")}`,
    );
  }

  return stories;
}

async function resolveStaticPath(requestUrl) {
  const parsed = new URL(requestUrl || "/", "http://127.0.0.1");
  const decodedPath = decodeURIComponent(parsed.pathname);
  const requestedPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const filePath = path.resolve(storybookDir, `.${requestedPath}`);
  const relativePath = path.relative(storybookDir, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return null;
  }

  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat) {
    return null;
  }

  if (fileStat.isDirectory()) {
    return path.join(filePath, "index.html");
  }

  return filePath;
}

async function serveStaticFile(request, response) {
  const filePath = await resolveStaticPath(request.url);

  if (!filePath) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const extension = path.extname(filePath);
  response.writeHead(200, {
    "content-type": mimeTypes.get(extension) || "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
}

function startStaticServer() {
  const server = createServer((request, response) => {
    void serveStaticFile(request, response).catch((error) => {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(error instanceof Error ? error.message : "Server error");
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to read Storybook server address."));
        return;
      }
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function captureStory(page, baseUrl, story, viewport) {
  console.log(`Capturing ${story.id} (${viewport.name})...`);
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
  await page.goto(
    `${baseUrl}/iframe.html?id=${encodeURIComponent(story.id)}&viewMode=story`,
    { waitUntil: "networkidle", timeout: 45_000 },
  );
  await page.waitForSelector("#storybook-root, #root", {
    state: "attached",
    timeout: 15_000,
  });
  await page.waitForFunction(() => document.body.childElementCount > 0, {
    timeout: 15_000,
  });
  await page.evaluate(async () => {
    if ("fonts" in document) {
      await document.fonts.ready;
    }
  });
  await page.waitForTimeout(400);

  const fileName = `${sanitizeFilePart(story.id)}--${viewport.name}.png`;
  const absolutePath = path.join(outputDir, fileName);
  await page.screenshot({ path: absolutePath, fullPage: true });

  return {
    storyId: story.id,
    title: story.title,
    name: story.name,
    viewport,
    file: path.relative(repoRoot, absolutePath),
  };
}

async function writeSummary(screenshots, failures) {
  const lines = [
    "# Storybook Screenshots",
    "",
    `Generated ${new Date().toISOString()}.`,
    "",
    "| Story | Viewport | File |",
    "| --- | --- | --- |",
  ];

  for (const screenshot of screenshots) {
    lines.push(
      `| ${screenshot.title} / ${screenshot.name} | ${screenshot.viewport.name} (${screenshot.viewport.width}x${screenshot.viewport.height}) | ${screenshot.file} |`,
    );
  }

  if (failures.length > 0) {
    lines.push("", "## Failed captures", "");
    for (const failure of failures) {
      lines.push(
        `- ${failure.storyId} (${failure.viewport.name}): ${failure.error}`,
      );
    }
  }

  await writeFile(path.join(outputDir, "summary.md"), `${lines.join("\n")}\n`);
}

async function main() {
  const stories = await readStorybookIndex();

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const { server, baseUrl } = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  const screenshots = [];
  const failures = [];

  try {
    const page = await browser.newPage();
    for (const story of stories) {
      for (const viewport of viewports) {
        try {
          screenshots.push(await captureStory(page, baseUrl, story, viewport));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Failed to capture ${story.id} (${viewport.name}): ${message}`);
          failures.push({ storyId: story.id, viewport, error: message });
        }
      }
    }
    await page.close();
  } finally {
    await browser.close();
    server.close();
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    storybookDir: path.relative(repoRoot, storybookDir),
    includeTags,
    screenshots,
    failures,
  };
  await writeFile(
    path.join(outputDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeSummary(screenshots, failures);

  console.log(
    `Captured ${screenshots.length} Storybook screenshots for ${stories.length} stories into ${path.relative(
      repoRoot,
      outputDir,
    )}.`,
  );

  if (failures.length > 0) {
    throw new Error(`${failures.length} screenshot capture(s) failed.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

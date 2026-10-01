import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { verifyAssets } from "./assets.mjs";
import { auditPublicLinks } from "./public-links.mjs";
import { auditNavigation } from "./navigation.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.join(root, "artifacts/docs-verification");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await writeFile(
  path.join(output, "report.json"),
  JSON.stringify({ passed: false, state: "running" }, null, 2) + "\n"
);
const seiso = path.join(root, "node_modules/.bin/seiso");
const failures = [];
const checks = [];
function check(name, passed, detail) {
  checks.push({ name, passed, detail });
  if (!passed) failures.push(name);
}
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    timeout: 60_000,
  });
  if (result.error) throw result.error;
  return result;
}
let report;
try {
  const version = run(seiso, ["--version"]);
  const expectedVersion = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"))
    .devDependencies["@scarletkc/seiso"];
  const assets = await verifyAssets(root);
  await writeFile(path.join(output, "assets.json"), JSON.stringify(assets, null, 2) + "\n");
  check("prototype-assets", assets.passed, assets);
  check(
    "locked-seiso",
    /^\d+\.\d+\.\d+$/.test(expectedVersion) &&
      version.status === 0 &&
      version.stdout.trim() === `seiso ${expectedVersion}`
  );
  const stable = run(seiso, ["check", "--no-cache", "--output-format", "json", "--statistics"]);
  await writeFile(path.join(output, "stable.json"), stable.stdout);
  check("stable-rules", stable.status === 0 && !stable.stderr.trim());
  const preview = run(seiso, [
    "check",
    "--no-cache",
    "--preview",
    "--select",
    "ALL",
    "--output-format",
    "json",
    "--statistics",
  ]);
  await writeFile(path.join(output, "preview.json"), preview.stdout);
  check("preview-complete", [0, 1].includes(preview.status) && !preview.stderr.trim());
  const indexed = run(seiso, ["index", "--dump", "--no-cache"]);
  const index = JSON.parse(indexed.stdout);
  await writeFile(path.join(output, "index.json"), indexed.stdout);
  check(
    "index-complete",
    indexed.status === 0 && index.index.complete && index.errors.length === 0
  );
  const publicLinks = auditPublicLinks(root, index);
  await writeFile(
    path.join(output, "public-links.json"),
    JSON.stringify(publicLinks, null, 2) + "\n"
  );
  check("public-link-targets", publicLinks.passed, publicLinks);
  const policy = run(seiso, ["policy"]);
  await writeFile(path.join(output, "policy.json"), policy.stdout);
  check("policy-complete", policy.status === 0 && !policy.stderr.trim());

  const files = new Map(index.index.files.map((file) => [file.filename, file]));
  check(
    "nonempty-docs-scope",
    [...files.keys()].filter((file) => file.startsWith("docs/")).length > 90
  );
  check(
    "private-files-not-indexed",
    ![...files.keys()].some((file) => file.startsWith("docs/private/"))
  );
  const ignored = run("git", ["check-ignore", "-q", "docs/private/example.md"]);
  check("private-files-git-ignored", ignored.status === 0);
  check("private-files-not-tracked", !run("git", ["ls-files", "docs/private"]).stdout.trim());

  const visited = new Set();
  const queue = ["README.md"];
  while (queue.length) {
    const name = queue.shift();
    if (visited.has(name)) continue;
    visited.add(name);
    for (const link of files.get(name)?.links ?? []) {
      const target = link.resolution.target;
      if (files.has(target) && !visited.has(target)) queue.push(target);
    }
  }
  const orphaned = [...files.keys()].filter((file) => !visited.has(file));
  check("documents-reachable", orphaned.length === 0, orphaned);
  const readingPaths = [
    "docs/guides/local-development.md",
    "docs/guides/browser-e2e.md",
    "docs/reference/matching.md",
    "docs/guides/production-release.md",
    "docs/records/project-history.md",
  ];
  for (const target of readingPaths) {
    check(`reading-path:${target}`, visited.has(target));
  }

  const navigation = auditNavigation(index);
  await writeFile(path.join(output, "navigation.json"), JSON.stringify(navigation, null, 2) + "\n");
  check(
    "category-parents",
    navigation.rootPresent && navigation.missingParents.length === 0,
    navigation.missingParents
  );
  check(
    "category-direct-navigation",
    navigation.missingChildren.length === 0,
    navigation.missingChildren
  );
  check(
    "category-parent-backlinks",
    navigation.missingBacklinks.length === 0,
    navigation.missingBacklinks
  );
  const owners = [
    "topology",
    "account",
    "matching",
    "vip",
    "coupons",
    "analytics",
    "public-data-cache",
    "server-api-routing",
  ];
  check(
    "fact-owner-pages",
    owners.every((name) => files.get(`docs/reference/${name}.md`)?.canonical === true)
  );

  const invalidHistory = [];
  const seen = new Set();
  const invalidCommits = [];
  const commits = new Set();
  for (const file of files.values()) {
    for (const link of file.links) {
      const commitLink = link.raw.match(
        /^https:\/\/github\.com\/LiLink-Campus\/LiLink\/commit\/([a-f0-9]{40})$/
      );
      if (commitLink && !commits.has(commitLink[1])) {
        commits.add(commitLink[1]);
        if (run("git", ["cat-file", "-t", commitLink[1]]).stdout.trim() !== "commit")
          invalidCommits.push(commitLink[1]);
      }
      const match = link.raw.match(
        /^https:\/\/github\.com\/LiLink-Campus\/LiLink\/blob\/([a-f0-9]{40})\/(.+?)(?:#.*)?$/
      );
      if (!match) continue;
      const [, commit, rawTarget] = match;
      const target = decodeURIComponent(rawTarget);
      const key = `${commit}:${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (run("git", ["cat-file", "-e", key]).status !== 0)
        invalidHistory.push({ file: file.filename, commit, target });
    }
  }
  check("historical-source-targets", invalidHistory.length === 0, invalidHistory);
  check("historical-commit-targets", invalidCommits.length === 0, invalidCommits);

  const packageFiles = [
    "package.json",
    "apps/api/package.json",
    "apps/web/package.json",
    "packages/shared/package.json",
  ];
  const packages = await Promise.all(
    packageFiles.map(async (filename) => ({
      filename,
      ...JSON.parse(await readFile(path.join(root, filename), "utf8")),
    }))
  );
  const invalidCommands = [];
  let commandCount = 0;
  for (const filename of files.keys()) {
    if (!filename.startsWith("docs/guides/") && !filename.startsWith("docs/reference/")) continue;
    const content = await readFile(path.join(root, filename), "utf8");
    for (const match of content.matchAll(/npm run ([\w:-]+)([^`\n]*)/g)) {
      const [, script, rest] = match;
      const workspace = rest.match(/--workspace\s+([\w@/.-]+)/)?.[1];
      const pkg = workspace
        ? packages.find(
            (candidate) =>
              candidate.name === workspace || candidate.filename.startsWith(`${workspace}/`)
          )
        : packages[0];
      commandCount++;
      if (!pkg?.scripts?.[script])
        invalidCommands.push({ filename, script, workspace: workspace ?? "root" });
    }
  }
  check("current-npm-commands", invalidCommands.length === 0, invalidCommands);
  check("diff-whitespace", run("git", ["diff", "--check"]).status === 0);
  report = {
    passed: failures.length === 0,
    environment: { node: process.version, seiso: version.stdout.trim(), database: "none" },
    prerequisites:
      "Complete Git history, installed locked dependencies, public Markdown scope only",
    indexedDocuments: files.size,
    reachableDocuments: visited.size,
    stableDiagnostics: JSON.parse(stable.stdout).diagnostics.length,
    previewDiagnostics: JSON.parse(preview.stdout).diagnostics.length,
    checkedHistoricalTargets: seen.size,
    checkedHistoricalCommits: commits.size,
    checkedNpmCommands: commandCount,
    checks,
  };
  console.log(
    JSON.stringify(
      {
        passed: report.passed,
        indexedDocuments: files.size,
        stableDiagnostics: report.stableDiagnostics,
        previewDiagnostics: report.previewDiagnostics,
        failures,
      },
      null,
      2
    )
  );
} catch (error) {
  report = {
    passed: false,
    environment: { node: process.version, database: "none" },
    checks,
    failure: error.message,
  };
  console.error(`Documentation verification failed: ${error.message}`);
}
await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
process.exitCode = report.passed ? 0 : 1;

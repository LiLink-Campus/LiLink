import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.join(root, "artifacts/docs-tooling-verification");
const fixtures = [];
const results = [];
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: os.devNull };
for (const name of Object.keys(env))
  if (name.startsWith("GIT_") && !["GIT_CONFIG_NOSYSTEM", "GIT_CONFIG_GLOBAL"].includes(name))
    delete env[name];
// The container bind mount retains the host runner UID; trust only this source root.
env.GIT_CONFIG_COUNT = "1";
env.GIT_CONFIG_KEY_0 = "safe.directory";
env.GIT_CONFIG_VALUE_0 = root;
const sourceCommit = run(root, "git", ["rev-parse", "HEAD"]).stdout.trim();
const sourceBytes = run(root, "git", ["show", `${sourceCommit}:README.md`], {
  encoding: null,
}).stdout;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Expected user-visible outcomes are declared before changing the gate.
const scenarios = [
  {
    name: "worktree-private-symlink",
    script: "check.mjs",
    allowed: false,
    target: "private/source.txt",
  },
  { name: "worktree-outside-symlink", script: "check.mjs", allowed: false, target: "outside" },
  {
    name: "worktree-public-symlink",
    script: "check.mjs",
    allowed: true,
    target: "public/source.txt",
  },
  { name: "frozen-source-rewritten-with-target", script: "verify.mjs", assetAllowed: false },
  {
    name: "worktree-private-anchor-symlink",
    script: "check.mjs",
    allowed: false,
    target: "private/source.md",
    anchor: true,
  },
  { name: "empty-migration-manifest", script: "verify.mjs", assetAllowed: false },
  { name: "outside-migration-target", script: "verify.mjs", assetAllowed: false },
  { name: "invalid-seiso-replaces-old-success", script: "verify.mjs", assetAllowed: true },
];

function run(directory, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: directory,
    env,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 8 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  return result;
}

async function fixture(scenario) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lilink-docs-tooling-verification-"));
  fixtures.push(directory);
  const cloned = run(root, "git", [
    "clone",
    "--shared",
    "--no-checkout",
    "--quiet",
    root,
    directory,
  ]);
  if (cloned.status !== 0) throw new Error("Synthetic checkout could not be created.");
  run(directory, "git", ["read-tree", "--empty"]);
  await mkdir(path.join(directory, "scripts"), { recursive: true });
  await cp(path.join(root, "scripts/docs"), path.join(directory, "scripts/docs"), {
    recursive: true,
  });
  await copyFile(path.join(root, "package.json"), path.join(directory, "package.json"));
  await symlink(path.join(root, "node_modules"), path.join(directory, "node_modules"), "dir");
  await writeFile(path.join(directory, ".gitignore"), "node_modules\nartifacts/\nprivate/\n");
  await writeFile(
    path.join(directory, "seiso.toml"),
    'include=["**/*.md"]\n[lint]\nselect=["LNK"]\n'
  );
  await writeFile(path.join(directory, "README.md"), "# Documentation\n");
  if (scenario.target) {
    let target;
    if (scenario.target === "outside") {
      target = await mkdtemp(path.join(os.tmpdir(), "lilink-docs-tooling-target-"));
      fixtures.push(target);
      target = path.join(target, "source.txt");
    } else target = path.join(directory, scenario.target);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(
      target,
      scenario.anchor ? "# Source\n\n## Detail\n" : "Synthetic documentation fixture\n"
    );
    const linkName = scenario.anchor ? "source.md" : "source.txt";
    await symlink(path.relative(directory, target), path.join(directory, linkName));
    await writeFile(
      path.join(directory, "README.md"),
      `# Documentation\n\n[Source](${linkName}${scenario.anchor ? "#detail" : ""})\n`
    );
  } else {
    await mkdir(path.join(directory, "prototypes"));
    const target =
      scenario.name === "frozen-source-rewritten-with-target"
        ? Buffer.from("Rewritten fixture\n")
        : sourceBytes;
    await writeFile(path.join(directory, "prototypes/source.txt"), target);
    if (scenario.name === "outside-migration-target") {
      const outside = await mkdtemp(path.join(os.tmpdir(), "lilink-docs-tooling-asset-"));
      fixtures.push(outside);
      await writeFile(path.join(outside, "source.txt"), target);
      await symlink(outside, path.join(directory, "prototypes/material"), "dir");
    }
    await writeFile(
      path.join(directory, "prototypes/migration-sha256.json"),
      JSON.stringify({
        sourceCommit,
        algorithm: "SHA-256",
        files:
          scenario.name === "empty-migration-manifest"
            ? []
            : [
                {
                  source: "README.md",
                  target:
                    scenario.name === "outside-migration-target"
                      ? "prototypes/material/source.txt"
                      : "prototypes/source.txt",
                  sha256: sha256(target),
                  bytes: target.length,
                },
              ],
      })
    );
    await mkdir(path.join(directory, "artifacts/docs-verification"), { recursive: true });
    await writeFile(
      path.join(directory, "artifacts/docs-verification/report.json"),
      JSON.stringify({ passed: true, staleFixture: true })
    );
    if (scenario.name === "invalid-seiso-replaces-old-success")
      await writeFile(path.join(directory, "seiso.toml"), "invalid = [\n");
  }
  return directory;
}

await mkdir(output, { recursive: true });
try {
  for (const scenario of scenarios) {
    try {
      const directory = await fixture(scenario);
      const executed = run(directory, process.execPath, [`scripts/docs/${scenario.script}`]);
      const gate = JSON.parse(
        await readFile(
          path.join(
            directory,
            scenario.target
              ? "artifacts/docs-check/report.json"
              : "artifacts/docs-verification/report.json"
          ),
          "utf8"
        )
      );
      const assertions = scenario.target
        ? {
            expectedExit: scenario.allowed ? executed.status === 0 : executed.status !== 0,
            expectedPublicLinks: gate.publicLinks?.passed === scenario.allowed,
            recordedResult: gate.passed === scenario.allowed,
          }
        : {
            rejectedIncompleteFixture: executed.status !== 0,
            replacedOldSuccess: gate.passed === false && !gate.staleFixture,
            terminalFailure:
              scenario.name !== "invalid-seiso-replaces-old-success" ||
              (typeof gate.failure === "string" &&
                gate.failure.length > 0 &&
                gate.state !== "running"),
            expectedAssets:
              JSON.parse(
                await readFile(
                  path.join(directory, "artifacts/docs-verification/assets.json"),
                  "utf8"
                )
              ).passed === scenario.assetAllowed,
          };
      results.push({
        ...scenario,
        passed: Object.values(assertions).every(Boolean),
        exitCode: executed.status,
        assertions,
      });
      await writeFile(
        path.join(output, `${scenario.name}.log`),
        (executed.stdout + executed.stderr).replaceAll(directory, "<fixture>")
      );
    } catch (error) {
      results.push({ ...scenario, passed: false, failure: error.message });
    }
    const result = results.at(-1);
    console.log(`${result.passed ? "PASS" : "FAIL"} ${scenario.name}`);
  }
} finally {
  for (const directory of fixtures) await rm(directory, { recursive: true, force: true });
}
const report = {
  passed: results.every((result) => result.passed),
  command: "node scripts/docs/verify-tooling.mjs",
  environment: { node: process.version, database: "none" },
  prerequisites:
    "Complete Git checkout, installed locked dependencies; synthetic files and existing Git objects only, no commits or application services",
  results,
};
await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
process.exitCode = report.passed ? 0 : 1;

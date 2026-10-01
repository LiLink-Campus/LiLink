import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFile, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GIT_HOOK_CONFIGS } from "../hooks/registry.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const output = path.join(root, "artifacts/docs-hooks-verification");
const hooks = GIT_HOOK_CONFIGS.filter((hook) => hook.event === "pre-commit");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const targetName = "docs/reference/target.md";
const targetContent = "---\nkind: reference\n---\n\n# Target\n";
const validReadme = (target = targetName) => `# Docs\n\n[Working](<${target}>)\n`;
const brokenReadme = "# Docs\n\n[Broken](missing.md)\n";
const fixtures = [];
const results = [];
const environment = { ...process.env, LILINK_DISABLE_MISE_HOOKS: "1", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: os.devNull };
for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"]) delete environment[name];

// These expected outcomes define the contract before the staged checker is implemented.
const scenarios = [
  { name: "invalid-staged-corrected-worktree", allowed: false },
  { name: "unstaged-link-target", allowed: false },
  { name: "valid-staged-invalid-worktree", allowed: true },
  { name: "fully-staged-valid", allowed: true },
  { name: "fully-staged-invalid", allowed: false },
  { name: "staged-deletion-restored-worktree", allowed: false },
  { name: "unmerged-index", allowed: false, explicitConflict: true },
  { name: "unicode-space-path", allowed: true },
  { name: "alternate-valid-index", allowed: true, alternate: true },
  { name: "alternate-invalid-index", allowed: false, alternate: true },
  { name: "staged-check-index-bytes-preserved", allowed: true, direct: true },
  { name: "unstaged-policy-cannot-weaken-staged-documents", allowed: false, direct: true },
  { name: "staged-policy-missing", allowed: false, direct: true },
  { name: "staged-policy-empty-scope", allowed: false, direct: true },
  { name: "staged-cli-exit-zero-override", allowed: false, direct: true, args: ["--exit-zero"] },
  { name: "staged-cli-path-override", allowed: false, direct: true, args: [targetName] },
  { name: "relative-alternate-valid-index", allowed: true, direct: true, alternate: true, relativeIndex: true },
];

function run(directory, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: directory, env: { ...environment, ...options.env }, encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024, timeout: 60_000, input: options.input,
  });
  if (result.error) throw result.error;
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
}

function git(directory, args, options) {
  const result = run(directory, "git", args, options);
  if (result.exitCode !== 0) throw new Error(`git ${args[0]} failed: ${result.stderr}`);
  return result.stdout;
}

const hash = (value) => createHash("sha256").update(value).digest("hex");

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "lilink-docs-hooks-verification-"));
  fixtures.push(directory);
  // Clone existing objects without creating a commit or copying private worktree files.
  git(root, ["clone", "--shared", "--no-checkout", "--quiet", root, directory]);
  git(directory, ["read-tree", "--empty"]);
  await mkdir(path.join(directory, "scripts"), { recursive: true });
  await mkdir(path.join(directory, "docs/reference"), { recursive: true });
  await cp(path.join(root, "scripts/docs"), path.join(directory, "scripts/docs"), { recursive: true });
  for (const filename of ["scripts/run-git-hook-command.mjs", "scripts/get-repo-root.mjs", "lint-staged.config.mjs", "seiso.toml"]) {
    await copyFile(path.join(root, filename), path.join(directory, filename));
  }
  await symlink(path.join(root, "node_modules"), path.join(directory, "node_modules"), "dir");
  await writeFile(path.join(directory, ".gitignore"), "node_modules\nartifacts/\n");
  await writeFile(path.join(directory, "package.json"), JSON.stringify({
    name: "docs-hooks-verification-fixture", private: true,
    scripts: {
      "lint:staged": packageJson.scripts["lint:staged"],
      "docs:check": packageJson.scripts["docs:check"],
      "docs:check:staged": packageJson.scripts["docs:check:staged"] ?? "node scripts/docs/check.mjs --staged",
    },
  }));
  for (const hook of hooks) {
    git(directory, ["config", "set", `hook.${hook.name}.event`, hook.event]);
    git(directory, ["config", "set", `hook.${hook.name}.command`, hook.command]);
  }
  return directory;
}

async function prepare(scenario, directory) {
  let readme = validReadme();
  if (["invalid-staged-corrected-worktree", "fully-staged-invalid", "unstaged-policy-cannot-weaken-staged-documents"].includes(scenario.name) || scenario.args || (scenario.alternate && scenario.allowed)) readme = brokenReadme;
  if (scenario.name === "unicode-space-path") readme = validReadme("docs/reference/中文 空格.md");
  if (scenario.name === "staged-deletion-restored-worktree") readme = validReadme("AGENTS.md");
  await writeFile(path.join(directory, "README.md"), readme);
  if (scenario.name !== "unstaged-link-target") await writeFile(path.join(directory, targetName), targetContent);
  if (scenario.name === "unicode-space-path") await writeFile(path.join(directory, "docs/reference/中文 空格.md"), targetContent);
  if (scenario.name === "staged-deletion-restored-worktree") await writeFile(path.join(directory, "AGENTS.md"), "---\nkind: howto\n---\n\n# Target\n");
  if (scenario.name === "staged-policy-empty-scope") await writeFile(path.join(directory, "seiso.toml"), 'include=["absent/**/*.md"]\n[lint]\nselect=["LNK"]\n');
  git(directory, ["add", "."]);

  if (scenario.name === "invalid-staged-corrected-worktree") await writeFile(path.join(directory, "README.md"), validReadme());
  if (scenario.name === "valid-staged-invalid-worktree") await writeFile(path.join(directory, "README.md"), brokenReadme);
  if (scenario.name === "unstaged-link-target") await writeFile(path.join(directory, targetName), targetContent);
  if (scenario.name === "staged-deletion-restored-worktree") git(directory, ["update-index", "--force-remove", "AGENTS.md"]);
  if (scenario.name === "unstaged-policy-cannot-weaken-staged-documents") await writeFile(path.join(directory, "seiso.toml"), "include=[]\n[lint]\nselect=[]\n");
  if (scenario.name === "staged-policy-missing") git(directory, ["update-index", "--force-remove", "seiso.toml"]);
  if (scenario.explicitConflict) {
    const blob = git(directory, ["hash-object", "-w", "--stdin"], { input: validReadme() }).trim();
    git(directory, ["update-index", "--index-info"], {
      input: `0 ${"0".repeat(40)}\tREADME.md\n` + [1, 2, 3].map((stage) => `100644 ${blob} ${stage}\tREADME.md\n`).join(""),
    });
  }

  const normalIndex = path.join(directory, ".git/index");
  const normalIndexBefore = hash(await readFile(normalIndex));
  const normalEntriesBefore = git(directory, ["ls-files", "--stage", "-z"]);
  const env = {};
  if (scenario.alternate) {
    const alternateIndex = path.join(directory, ".git/review-alternate-index");
    env.GIT_INDEX_FILE = scenario.relativeIndex ? ".git/review-alternate-index" : alternateIndex;
    await copyFile(normalIndex, alternateIndex);
    await writeFile(path.join(directory, "README.md"), scenario.allowed ? validReadme() : brokenReadme);
    git(directory, ["add", "README.md"], { env });
    await writeFile(path.join(directory, "README.md"), validReadme());
  }
  const selectedIndex = scenario.alternate ? path.join(directory, ".git/review-alternate-index") : normalIndex;
  return { env, normalIndex, normalIndexBefore, normalEntriesBefore, selectedIndex };
}

await mkdir(output, { recursive: true });
try {
  for (const scenario of scenarios) {
    try {
      const directory = await fixture();
      const state = await prepare(scenario, directory);
      const selectedEntriesBefore = git(directory, ["ls-files", "--stage", "-z"], { env: state.env });
      const selectedIndexBefore = hash(await readFile(state.selectedIndex));
      const hook = scenario.direct
        ? run(directory, "npm", ["run", "docs:check:staged", ...(scenario.args ? ["--", ...scenario.args] : [])], { env: state.env })
        : run(directory, "git", ["hook", "run", "pre-commit"], { env: state.env });
      const selectedEntriesAfter = git(directory, ["ls-files", "--stage", "-z"], { env: state.env });
      const combinedOutput = hook.stdout + hook.stderr;
      const assertions = {
        expectedExit: scenario.allowed ? hook.exitCode === 0 : hook.exitCode !== 0,
        ...(scenario.direct
          ? { stagedCommandExecuted: combinedOutput.includes("> docs:check:staged"), selectedIndexBytesPreserved: hash(await readFile(state.selectedIndex)) === selectedIndexBefore }
          : { bothHooksExecuted: combinedOutput.includes("> lint:staged") && /> docs:check(?::staged)?\b/.test(combinedOutput) }),
        selectedIndexPreserved: selectedEntriesAfter === selectedEntriesBefore,
        explicitConflict: !scenario.explicitConflict || /index[^\n]*(?:unmerged|conflict)|(?:unmerged|conflict)[^\n]*index/i.test(combinedOutput),
        originalIndexPreserved: !scenario.alternate || (hash(await readFile(state.normalIndex)) === state.normalIndexBefore && git(directory, ["ls-files", "--stage", "-z"]) === state.normalEntriesBefore),
        stagedDocumentChecked: scenario.name !== "unstaged-policy-cannot-weaken-staged-documents" || combinedOutput.includes("LNK001"),
        overrideDiagnosis: !scenario.args || /scope|rule|override|argument|参数/i.test(combinedOutput),
      };
      const result = { ...scenario, passed: Object.values(assertions).every(Boolean), assertions, hookExitCode: hook.exitCode, selectedIndexEntriesSha256: hash(selectedEntriesBefore) };
      results.push(result);
      // Fixture paths are ephemeral and do not make evidence depend on an existing directory.
      await writeFile(path.join(output, `${scenario.name}.log`), combinedOutput.replaceAll(directory, "<fixture>").replaceAll(path.resolve(directory), "<fixture>"));
      console.log(`${result.passed ? "PASS" : "FAIL"} ${scenario.name}: expected ${scenario.allowed ? "allow" : "reject"}, exit ${hook.exitCode}`);
    } catch (error) {
      results.push({ ...scenario, passed: false, error: error instanceof Error ? error.message : String(error) });
      console.log(`FAIL ${scenario.name}: fixture or hook execution failed`);
    }
  }
} finally {
  for (const directory of fixtures) await rm(directory, { recursive: true, force: true });
}

const report = {
  passed: results.every((result) => result.passed),
  environment: { node: process.version, npm: run(root, "npm", ["--version"]).stdout.trim(), git: run(root, "git", ["--version"]).stdout.trim(), seiso: run(root, path.join(root, "node_modules/.bin/seiso"), ["--version"]).stdout.trim(), database: "none" },
  command: "node scripts/docs/verify-hooks.mjs",
  prerequisites: "Node 24, npm 11, Git 2.54+, installed locked dependencies, and a Git checkout with an existing HEAD. Synthetic fixture data only; no application service or database.",
  configuredPreCommitHooks: hooks,
  fixturePolicy: "Existing Git objects are reused; no commits are created. Every isolated fixture is removed after validation. Full hooks preserve index entries; direct staged checks also preserve selected index bytes. Alternate index cases preserve original index bytes and entries.",
  results,
};
await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ passed: report.passed, cases: results.length, failures: results.filter((result) => !result.passed).map((result) => result.name), report: path.join(output, "report.json") }, null, 2));
process.exitCode = report.passed ? 0 : 1;

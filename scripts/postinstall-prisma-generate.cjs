const { existsSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const workspaceRoot = path.resolve(__dirname, "..");
const apiWorkspacePath = path.join(workspaceRoot, "apps", "api");

runGitHookInstallCheck();

if (!existsSync(path.join(apiWorkspacePath, "package.json"))) {
  process.exit(0);
}

let prismaInstalled = false;

try {
  require.resolve("prisma/package.json", {
    paths: [apiWorkspacePath, workspaceRoot],
  });
  prismaInstalled = true;
} catch {
  prismaInstalled = false;
}

if (!prismaInstalled) {
  process.exit(0);
}

const npmExecPath = process.env.npm_execpath;
const npmCommand = npmExecPath
  ? process.execPath
  : process.platform === "win32"
    ? "npm.cmd"
    : "npm";
const npmArguments = npmExecPath
  ? [npmExecPath, "run", "prisma:generate", "--workspace", "api"]
  : ["run", "prisma:generate", "--workspace", "api"];

const result = spawnSync(npmCommand, npmArguments, {
  cwd: workspaceRoot,
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

function runGitHookInstallCheck() {
  const result = spawnSync(
    process.execPath,
    [path.join(__dirname, "check-git-hooks-installed.mjs")],
    {
      cwd: workspaceRoot,
      stdio: "inherit",
      windowsHide: true,
    },
  );

  if (result.error) {
    console.warn(
      `LiLink Git hook install check skipped: ${result.error.message}`,
    );
  }
}

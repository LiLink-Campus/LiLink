import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, "../..");
const build = spawnSync("npm", ["run", "build:shared"], {
  cwd: repo,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);

// Start the editable copy directly; never regenerate or overwrite its files.
const child = spawn(
  "npm",
  ["run", "dev", "--", "--webpack", "--port", "3101", "--hostname", "127.0.0.1"],
  { cwd: path.join(root, "web"), stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 1));

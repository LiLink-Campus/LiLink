import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const projectRoot = realpathSync(path.resolve(currentDirectory, ".."));
const nextBinary = path.resolve(
  projectRoot,
  "..",
  "..",
  "node_modules",
  ".bin",
  process.platform === "win32" ? "next.cmd" : "next",
);

const result = spawnSync(nextBinary, ["build", "--webpack"], {
  cwd: projectRoot,
  env: process.env,
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);

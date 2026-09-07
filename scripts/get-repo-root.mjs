import { execFileSync } from "node:child_process";

export function getRepoRoot() {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

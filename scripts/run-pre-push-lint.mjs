#!/usr/bin/env node

import { execFileSync } from "node:child_process";

function runNpm(args) {
  if (process.env.npm_execpath) {
    execFileSync(process.execPath, [process.env.npm_execpath, ...args], {
      stdio: "inherit",
      windowsHide: true,
    });
    return;
  }

  execFileSync("npm", args, {
    stdio: "inherit",
    windowsHide: true,
  });
}

try {
  runNpm(["run", "lint"]);
  execFileSync("git", ["diff", "--exit-code"], {
    stdio: "inherit",
    windowsHide: true,
  });
} catch (error) {
  if (typeof error?.status === "number") {
    process.exitCode = error.status;
  } else {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

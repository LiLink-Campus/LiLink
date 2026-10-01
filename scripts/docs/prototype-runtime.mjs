import { spawn, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

export async function createPrototypeRuntime(root, output, signal) {
  const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "SYSTEMROOT", "WINDIR"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  const build = spawnSync("npm", ["run", "build:shared"], { cwd: root, env, encoding: "utf8", timeout: 120000 });
  await writeFile(path.join(output, "shared-build.log"), (build.stdout ?? "") + (build.stderr ?? ""));
  if (build.error || build.status !== 0) throw new Error("Shared build failed; see shared-build.log.");
  const workspace = await mkdtemp(path.join(output, "workspace-"));
  const web = path.join(workspace, "prototypes/autumn-2026/web");
  const networkLog = path.join(output, "server-fetch.jsonl");
  let child;
  let stopping;
  const log = createWriteStream(path.join(output, "server.log"), { flags: "w" });
  const stop = () => stopping ??= (async () => {
    if (child?.pid) {
      try { process.kill(-child.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") throw error; }
      let timer;
      await Promise.race([child.done, new Promise((resolve) => { timer = setTimeout(resolve, 5000); })]);
      clearTimeout(timer);
      try { process.kill(-child.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
      await child.done;
    }
    await new Promise((resolve) => log.end(resolve));
    await rm(workspace, { recursive: true, force: true });
  })();
  try {
    await cp(path.join(root, "prototypes/autumn-2026/web"), web, {
      recursive: true,
      filter: (source) => {
        const name = path.basename(source);
        return !["node_modules", ".next", "next-env.d.ts"].includes(name) && !name.startsWith(".env") && !name.endsWith(".tsbuildinfo");
      },
    });
    await mkdir(path.join(workspace, "packages"), { recursive: true });
    await symlink(path.join(root, "packages/shared"), path.join(workspace, "packages/shared"), "dir");
    await symlink(path.join(root, "node_modules"), path.join(workspace, "node_modules"), "dir");
    await writeFile(networkLog, "");
    const port = await freePort();
    const base = new URL(`http://127.0.0.1:${port}/`);
    const guard = pathToFileURL(path.join(root, "scripts/docs/server-fetch-guard.mjs")).href;
    child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--port", String(port), "--hostname", "127.0.0.1"], {
      cwd: web, detached: true, stdio: ["ignore", "pipe", "pipe"],
      env: { ...env, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", NODE_OPTIONS: `--import=${guard}`, LILINK_DOCS_SERVER_FETCH_LOG: networkLog },
    });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    let startupError;
    child.done = new Promise((resolve) => {
      child.once("error", (error) => { startupError = error; resolve(); });
      child.once("exit", resolve);
    });
    const deadline = Date.now() + 90000;
    while (true) {
      if (signal?.aborted) throw new Error("Prototype startup was interrupted.");
      if (startupError || child.exitCode !== null || child.signalCode !== null) throw new Error("Prototype server exited before readiness; see server.log.");
      try {
        if ((await fetch(base, { signal: AbortSignal.timeout(2000) })).ok) break;
      } catch {}
      if (Date.now() >= deadline) throw new Error("Prototype readiness timed out; see server.log.");
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return {
      base, web, stop,
      async networkEvidence() {
        const events = (await readFile(networkLog, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
        return {
          guardInstalled: events.some((event) => event.event === "installed"),
          blockedRequests: events.filter((event) => event.event === "blocked-fetch"),
          blockedFrameworkChecks: events.filter((event) => event.event === "blocked-framework-check").length,
        };
      },
    };
  } catch (error) {
    await stop();
    throw error;
  }
}

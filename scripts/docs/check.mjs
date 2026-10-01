import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditPublicLinks } from "./public-links.mjs";
import { createStagedSnapshot } from "./staged-snapshot.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const seiso = path.join(root, "node_modules/.bin/seiso");
const staged = process.argv[2] === "--staged";
const args = process.argv.slice(staged ? 3 : 2);
const output = path.join(root, staged ? "artifacts/docs-check-staged" : "artifacts/docs-check");
const controller = new AbortController();
const interrupt = () => controller.abort(new Error("Documentation verification was interrupted."));
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.once(signal, interrupt);
let snapshot;
let report;
try {
  if (staged && args.length) throw new Error("The staged documentation gate does not accept scope or rule overrides.");
  snapshot = staged ? await createStagedSnapshot(root, controller.signal) : { root, env: process.env };
  const options = { cwd: snapshot.root, env: snapshot.env, timeout: 60_000 };
  const stable = spawnSync(seiso, ["check", "--no-cache", ...args], { ...options, stdio: "inherit" });
  if (stable.error) throw stable.error;
  const indexed = spawnSync(seiso, ["index", "--dump", "--no-cache"], { ...options, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (indexed.error) throw indexed.error;
  if (indexed.status !== 0) throw new Error("Seiso did not produce a complete documentation index.");
  const index = JSON.parse(indexed.stdout);
  if (!index.index.complete || index.errors.length || !index.index.files.length) throw new Error("Seiso documentation index is incomplete or empty.");
  const links = auditPublicLinks(snapshot.root, index, snapshot.publicFiles);
  for (const failure of links.failures) console.error(`${failure.filename}: ${failure.link}: ${failure.reason}`);
  await snapshot.assertUnchanged?.();
  controller.signal.throwIfAborted();
  report = { passed: stable.status === 0 && links.passed, scope: staged ? "staged" : "worktree", seisoExitCode: stable.status, publicLinks: links, snapshot: snapshot.evidence };
} catch (error) {
  const failure = error instanceof Error ? error.message : String(error);
  console.error(failure);
  report = { passed: false, scope: staged ? "staged" : "worktree", failure };
} finally {
  await snapshot?.close?.();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.removeListener(signal, interrupt);
}
await mkdir(output, { recursive: true });
await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
process.exitCode = report.passed ? 0 : 1;

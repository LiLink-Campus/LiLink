import { lstat, readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";

export async function verifyAssets(root) {
  const manifest = JSON.parse(
    await readFile(path.join(root, "prototypes/migration-sha256.json"), "utf8")
  );
  const failures = [];
  const physicalRoot = await realpath(root);
  async function localFile(filename) {
    const target = path.join(root, filename);
    if (
      !(await lstat(target)).isFile() ||
      !(await realpath(target)).startsWith(physicalRoot + path.sep)
    ) {
      throw new Error("Migration files must be regular files inside the workspace");
    }
    return target;
  }
  const safePath = (filename) =>
    typeof filename === "string" &&
    filename.length > 0 &&
    !path.isAbsolute(filename) &&
    !path.win32.isAbsolute(filename) &&
    !filename.split(/[\\/]/).includes("..") &&
    !filename.includes("\0");
  const validHash = (hash) => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash);
  const validBytes = (bytes) => Number.isSafeInteger(bytes) && bytes >= 0;
  if (
    !/^[a-f0-9]{40}$/.test(manifest.sourceCommit) ||
    manifest.algorithm !== "SHA-256" ||
    !Array.isArray(manifest.files) ||
    !manifest.files.length
  ) {
    return {
      passed: false,
      checked: 0,
      adapted: 0,
      failures: [
        { reason: "Migration manifest must contain a fixed Git source and nonempty file set" },
      ],
    };
  }
  const targets = new Set();
  const sources = new Set();
  for (const entry of manifest.files) {
    try {
      if (
        !safePath(entry.source) ||
        !safePath(entry.target) ||
        !validHash(entry.sha256) ||
        !validBytes(entry.bytes) ||
        targets.has(entry.target) ||
        sources.has(entry.source)
      )
        throw new Error("Invalid or duplicate migration entry");
      targets.add(entry.target);
      sources.add(entry.source);
      const contents = await readFile(await localFile(entry.target));
      const sha256 = createHash("sha256").update(contents).digest("hex");
      if (sha256 !== entry.sha256 || contents.length !== entry.bytes) {
        failures.push({ target: entry.target, reason: "Content differs from frozen source" });
      }
      const adapted = entry.sourceSha256 !== undefined;
      if (
        adapted &&
        (!validHash(entry.sourceSha256) ||
          !validBytes(entry.sourceBytes) ||
          !safePath(entry.adaptationRecord))
      )
        throw new Error("Adaptation requires frozen source metadata and an acceptance record");
      const source = spawnSync(
        "git",
        ["cat-file", "blob", `${manifest.sourceCommit}:${entry.source}`],
        { cwd: root, maxBuffer: 32 * 1024 * 1024, timeout: 30_000 }
      );
      if (
        source.error ||
        source.status !== 0 ||
        source.stdout.length !== (adapted ? entry.sourceBytes : entry.bytes) ||
        createHash("sha256").update(source.stdout).digest("hex") !==
          (adapted ? entry.sourceSha256 : entry.sha256)
      ) {
        failures.push({
          target: entry.target,
          reason: "Frozen source cannot be verified against Git history",
        });
      }
      if (adapted) {
        await readFile(await localFile(entry.adaptationRecord));
      }
    } catch (error) {
      failures.push({
        target: entry.target,
        reason: error.code ? "File is unavailable" : error.message,
      });
    }
  }
  return {
    passed: failures.length === 0,
    sourceCommit: manifest.sourceCommit,
    checked: manifest.files.length,
    adapted: manifest.files.filter((entry) => entry.sourceSha256).length,
    failures,
  };
}

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const maxBuffer = 128 * 1024 * 1024;
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export async function createStagedSnapshot(root, signal) {
  const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), "lilink-staged-docs-")));
  const directory = path.join(temporary, "workspace");
  const env = { ...process.env };
  for (const key of ["GIT_INDEX_FILE", "GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR"]) {
    if (env[key]) env[key] = path.resolve(process.cwd(), env[key]);
  }
  const checkInterrupted = () => signal?.throwIfAborted();
  function git(args, overrides = {}) {
    checkInterrupted();
    const result = spawnSync("git", args, { cwd: root, env, maxBuffer, timeout: 30_000, ...overrides });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Staged documentation index could not be read: ${result.stderr.toString().trim()}`);
    return result.stdout;
  }
  const close = () => rm(temporary, { recursive: true, force: true });
  try {
    const sourceIndex = git(["rev-parse", "--path-format=absolute", "--git-path", "index"]).toString().trim();
    // write-tree updates cache-tree entries; only let it write our copied index.
    const indexCopy = path.join(temporary, "index");
    await copyFile(sourceIndex, indexCopy);
    const sourceHash = digest(await readFile(indexCopy));
    env.GIT_INDEX_FILE = indexCopy;
    if (git(["ls-files", "--unmerged", "-z"]).length) throw new Error("Staged documentation index has unresolved conflicts.");
    const tree = git(["write-tree"]).toString().trim();
    const entries = git(["ls-tree", "-rz", "--full-tree", tree]).toString().split("\0").filter(Boolean).map((record) => {
      const separator = record.indexOf("\t");
      const [mode, type, object] = record.slice(0, separator).split(" ");
      return { mode, type, object, filename: record.slice(separator + 1) };
    });
    const policy = entries.find((entry) => entry.filename === "seiso.toml");
    if (!policy || !["100644", "100755"].includes(policy.mode)) throw new Error("Staged documentation requires a regular seiso.toml in the index.");
    for (const entry of entries) {
      const resolved = path.resolve(directory, entry.filename);
      if (!resolved.startsWith(directory + path.sep)) throw new Error("Staged documentation index contains an unsafe path.");
      if (entry.type !== "blob") throw new Error(`Staged documentation cannot inspect a gitlink: ${entry.filename}`);
      if (entry.mode === "120000" && (/\.(md|markdown)$/i.test(entry.filename) || path.basename(entry.filename) === ".gitignore")) {
        throw new Error(`Staged documentation cannot inspect a symbolic document or policy: ${entry.filename}`);
      }
    }
    await mkdir(directory);
    // Read raw Git blobs, without worktree attributes or smudge filters.
    const blobs = git(["cat-file", "--batch"], { input: entries.map((entry) => entry.object).join("\n") + "\n" });
    let offset = 0;
    const links = [];
    for (const entry of entries) {
      checkInterrupted();
      const end = blobs.indexOf(10, offset);
      const [object, type, size] = blobs.subarray(offset, end).toString().split(" ");
      const length = Number(size);
      offset = end + 1;
      if (end < 0 || object !== entry.object || type !== "blob" || !Number.isSafeInteger(length) || length < 0 || offset + length >= blobs.length) {
        throw new Error("Staged documentation received incomplete Git objects.");
      }
      const contents = blobs.subarray(offset, offset + length);
      offset += length + 1;
      const target = path.join(directory, entry.filename);
      await mkdir(path.dirname(target), { recursive: true });
      if (entry.mode === "120000") links.push({ target, filename: entry.filename, destination: contents.toString() });
      else await writeFile(target, contents, { mode: entry.mode === "100755" ? 0o755 : 0o644 });
    }
    for (const link of links) {
      const destination = path.resolve(path.dirname(link.target), link.destination);
      if (path.isAbsolute(link.destination) || path.win32.isAbsolute(link.destination) || !destination.startsWith(directory + path.sep)) {
        throw new Error(`Staged documentation link leaves the snapshot: ${link.filename}`);
      }
      await symlink(link.destination, link.target);
    }
    for (const link of links) {
      if (!(await realpath(link.target)).startsWith(directory + path.sep)) throw new Error(`Staged documentation link leaves the snapshot: ${link.filename}`);
    }
    if (!(await lstat(path.join(directory, "seiso.toml"))).isFile()) throw new Error("Staged documentation policy is unavailable.");
    const scannerEnv = { ...process.env };
    for (const key of Object.keys(scannerEnv)) if (key.startsWith("GIT_")) delete scannerEnv[key];
    return {
      root: directory, publicFiles: new Set(entries.map((entry) => entry.filename)), env: scannerEnv, close,
      evidence: { scope: "staged", tree, files: entries.length },
      async assertUnchanged() {
        checkInterrupted();
        if (digest(await readFile(sourceIndex)) !== sourceHash) throw new Error("Staged documentation index changed during verification; rerun the check.");
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}

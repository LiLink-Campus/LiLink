import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import path from "node:path";

export function auditPublicLinks(root, index, publicFiles) {
  if (!publicFiles) publicFiles = listPublicFiles(root);
  const physicalRoot = realpathSync(root);
  const failures = [];
  let checked = 0;
  for (const file of index.index.files) {
    for (const link of file.links) {
      const { status, target } = link.resolution;
      if (status === "external") continue;
      checked++;
      if (status === "outside_workspace" || (target && !publicFiles.has(target))) {
        failures.push({
          filename: file.filename,
          link: link.raw,
          reason: "Target is outside the public Git file set",
        });
      } else if (target) {
        let physicalTarget;
        try {
          physicalTarget = path
            .relative(physicalRoot, realpathSync(path.join(root, target)))
            .split(path.sep)
            .join("/");
        } catch {
          physicalTarget = undefined;
        }
        if (!physicalTarget || !publicFiles.has(physicalTarget)) {
          failures.push({
            filename: file.filename,
            link: link.raw,
            reason: "Resolved symbolic target is outside the public Git file set",
          });
        }
      }
    }
  }
  return { passed: failures.length === 0, checked, failures };
}

function listPublicFiles(root) {
  const listed = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      timeout: 30_000,
    }
  );
  if (listed.error) throw listed.error;
  if (listed.status !== 0) throw new Error("Cannot enumerate the public Git file set.");
  return new Set(listed.stdout.split("\0").filter(Boolean));
}

import path from "node:path";

/** Audit direct category navigation using Seiso's resolved public links. */
export function auditNavigation(index) {
  const files = new Map(index.index.files.map((file) => [file.filename, file]));
  const documents = [...files.keys()].filter((name) => name.startsWith("docs/")).sort();
  const directories = new Set(documents.map((name) => path.posix.dirname(name)));
  const missingParents = [];
  const missingChildren = [];
  const missingBacklinks = [];
  function linksTo(filename, target) {
    return files.get(filename)?.links.some((link) =>
      link.resolution.status === "file" && link.resolution.target === target,
    ) ?? false;
  }
  for (const filename of documents) {
    if (filename === "docs/README.md") continue;
    const directory = path.posix.dirname(filename);
    const parent = path.posix.basename(filename) === "README.md"
      ? `${path.posix.dirname(directory)}/README.md`
      : `${directory}/README.md`;
    if (!files.has(parent)) missingParents.push({ filename, parent });
    else if (!linksTo(parent, filename)) missingChildren.push({ parent, child: filename });
    if (!linksTo(filename, parent)) missingBacklinks.push({ filename, parent });
  }
  const rootPresent = files.has("docs/README.md");
  return {
    passed: rootPresent && documents.length > 0 && missingParents.length === 0
      && missingChildren.length === 0 && missingBacklinks.length === 0,
    rootPresent,
    checkedDocuments: documents.length,
    checkedDirectories: directories.size,
    checkedRelationships: Math.max(0, documents.length - 1),
    missingParents,
    missingChildren,
    missingBacklinks,
  };
}

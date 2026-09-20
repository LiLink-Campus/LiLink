import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
const root = path.resolve(import.meta.dirname, "../apps/web/src");
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]
  );
}
const files = walk(root);
const stories = files.filter((f) => f.endsWith(".stories.tsx"));
function resolve(from, spec) {
  const base = spec.startsWith("@/")
    ? path.join(root, spec.slice(2))
    : spec.startsWith(".")
      ? path.resolve(path.dirname(from), spec)
      : null;
  return (
    base &&
    [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`].find(
      (f) => existsSync(f) && !readdirSafe(f)
    )
  );
}
function readdirSafe(f) {
  try {
    readdirSync(f);
    return true;
  } catch {
    return false;
  }
}
const imports = new Map();
function dependencies(file) {
  if (imports.has(file)) return imports.get(file);
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const deps = source.statements
    .filter((n) => ts.isImportDeclaration(n) && !n.importClause?.isTypeOnly)
    .map((n) => resolve(file, n.moduleSpecifier.text))
    .filter(Boolean);
  imports.set(file, deps);
  return deps;
}
const covered = new Set();
function visit(file) {
  if (covered.has(file)) return;
  covered.add(file);
  for (const dep of dependencies(file)) if (/\.[jt]sx?$/.test(dep)) visit(dep);
}
stories.forEach(visit);
const exceptionsPath = path.join(root, "stories/coverage-exceptions.json");
const exceptions = existsSync(exceptionsPath)
  ? JSON.parse(readFileSync(exceptionsPath, "utf8"))
  : {};
const report = { stories: stories.length, routes: [], components: [], exclusions: [], missing: [] };
for (const file of files.filter(
  (f) => f.endsWith(".tsx") && !f.includes("/stories/") && !f.endsWith(".stories.tsx")
)) {
  const name = path.relative(root, file);
  const source = readFileSync(file, "utf8");
  const isRoute = /\/(page|layout|error|global-error|not-found|loading)\.tsx$/.test(file);
  if (isRoute && /redirect\(/.test(source) && !/<[A-Z]|<main|<div|<section/.test(source)) {
    report.routes.push({
      file: name,
      kind: "redirect",
      destination: source.match(/redirect\(([^)]+)\)/)?.[1],
    });
    continue;
  }
  if (
    covered.has(file) ||
    (isRoute && dependencies(file).some((d) => d.endsWith(".tsx") && covered.has(d)))
  ) {
    report[isRoute ? "routes" : "components"].push({ file: name, kind: "story-import" });
    continue;
  }
  if (exceptions[name]) {
    report.exclusions.push({ file: name, reason: exceptions[name] });
    continue;
  }
  report.missing.push(name);
}
for (const name of Object.keys(exceptions))
  if (!existsSync(path.join(root, name))) report.missing.push(`Stale exception: ${name}`);
console.log(JSON.stringify(report, null, 2));
if (report.missing.length) process.exitCode = 1;

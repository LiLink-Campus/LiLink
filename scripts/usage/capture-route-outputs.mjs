import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readDisposableSession, readComparisonSession, repositoryRoot } from '../performance/local-session.mjs';

const [sessionPath, comparisonPath, outputPath, ...extra] = process.argv.slice(2);
if (!sessionPath || !comparisonPath || !outputPath || extra.length) {
  throw new Error('Usage: node scripts/usage/capture-route-outputs.mjs <canonical-session.json> <canonical-comparison-session.json> <new-artifact-directory>');
}
const session = await readDisposableSession(sessionPath);
const baseline = await readComparisonSession(comparisonPath);
if (baseline.session.runId !== session.runId || baseline.comparison.active !== true
  || baseline.comparison.sharedSyntheticData !== true) {
  throw new Error('Both active builds must share the same canonical disposable session and synthetic data.');
}
const unitBytes = 8192;
const relative = file => path.relative(repositoryRoot, file).split(path.sep).join('/');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const workspaces = {
  before: path.join(repositoryRoot, 'artifacts/performance', `baseline-${session.runId}`, 'workspace'),
  after: path.join(repositoryRoot, 'artifacts/e2e', session.runId, 'workspace'),
};
async function canonical(file, allowMissing = false) {
  const parts = path.relative(repositoryRoot, file).split(path.sep);
  if (parts.includes('..') || path.isAbsolute(parts.join(path.sep))) throw new Error('Path leaves the repository.');
  let current = repositoryRoot;
  for (const part of parts.filter(Boolean)) {
    current = path.join(current, part);
    let info;
    try { info = await lstat(current); } catch (error) {
      if (allowMissing && error.code === 'ENOENT') return;
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error(`Symlinks are not valid route evidence: ${relative(current)}`);
  }
  if (await realpath(file) !== file) throw new Error('Route evidence must use canonical filesystem paths.');
}
async function collect(directory, prefix = '') {
  const selected = [];
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlinked build output is not accepted: ${relative(file)}`);
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) selected.push(...await collect(file, name));
    else if (/\.(html|rsc|meta|body)$/.test(name)) selected.push({ file, name });
  }
  return selected;
}
const phases = {};
const copies = [];
const signatures = [];
const snapshotKey = info => `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
for (const [phase, workspace] of Object.entries(workspaces)) {
  const buildRoot = path.join(workspace, 'apps/web/.next');
  const appRoot = path.join(buildRoot, 'server/app');
  await canonical(appRoot);
  await canonical(path.join(buildRoot, 'BUILD_ID'));
  const buildId = (await readFile(path.join(buildRoot, 'BUILD_ID'), 'utf8')).trim();
  if (!buildId) throw new Error(`${phase}: a completed production build is required.`);
  const files = [];
  const bodies = new Map();
  for (const { file, name } of await collect(appRoot)) {
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    let body, info;
    try {
      info = await handle.stat({ bigint: true });
      if (!info.isFile()) throw new Error(`${phase}: route output is not a regular file: ${name}`);
      body = await handle.readFile();
      if (snapshotKey(info) !== snapshotKey(await handle.stat({ bigint: true })) || info.size !== BigInt(body.length)) {
        throw new Error(`${phase}: route output changed while reading: ${name}`);
      }
    } finally { await handle.close(); }
    if (!body.length) throw new Error(`${phase}: empty route output: ${name}`);
    if (name.endsWith('.html') && !body.toString().includes('</html>')) {
      throw new Error(`${phase}: incomplete HTML: ${name}`);
    }
    if (name.endsWith('.meta')) {
      const metadata = JSON.parse(body.toString());
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw new Error(`${phase}: invalid metadata: ${name}`);
    }
    const artifact = `raw/${phase}/${name}`;
    files.push({ path: name, kind: name.endsWith('.segment.rsc') ? 'segment-rsc' : path.extname(name).slice(1),
      rawBytes: body.length, raw8KiBUnits: Math.ceil(body.length / unitBytes), sha256: hash(body), artifact,
      complete: true, completenessBasis: 'stable nonempty file, format boundary and required companions' });
    bodies.set(name, body);
    copies.push({ artifact, body });
    signatures.push({ file, key: snapshotKey(info) });
  }
  if (!files.length) throw new Error(`${phase}: no prerendered route outputs found.`);
  for (const name of bodies.keys()) {
    if (name.endsWith('.html')) {
      const stem = name.slice(0, -5);
      const required = [`${stem}.rsc`, `${stem}.meta`, `${stem}.segments/_full.segment.rsc`, `${stem}.segments/_tree.segment.rsc`];
      if (required.some(file => !bodies.has(file))
        || ![...bodies.keys()].some(file => file.startsWith(`${stem}.segments/`) && file.endsWith('/__PAGE__.segment.rsc'))) {
        throw new Error(`${phase}: missing prerendered companions for ${name}`);
      }
      if (!bodies.get(`${stem}.rsc`).equals(bodies.get(`${stem}.segments/_full.segment.rsc`))) {
        throw new Error(`${phase}: full RSC and segment disagree for ${name}`);
      }
    } else if (name.endsWith('.meta')) {
      const stem = name.slice(0, -5);
      if (!bodies.has(`${stem}.html`) && !bodies.has(`${stem}.body`)) throw new Error(`${phase}: metadata has no response: ${name}`);
    }
  }
  const sum = subset => ({ localFileCount: subset.length, rawBytes: subset.reduce((total, file) => total + file.rawBytes, 0),
    independentlyRounded8KiBUnits: subset.reduce((total, file) => total + file.raw8KiBUnits, 0) });
  const homepage = files.filter(file => /^index\.(html|rsc|meta)$/.test(file.path) || file.path.startsWith('index.segments/'));
  if (!homepage.some(file => file.path === 'index.html')) throw new Error(`${phase}: the complete homepage output is required.`);
  phases[phase] = { workspace: relative(workspace), buildId, files, totals: sum(files),
    homepage: { ...sum(homepage), paths: homepage.map(file => file.path) } };
}
// Fail closed if a live request regenerated any collected output during capture.
for (const { file, key } of signatures) {
  if (snapshotKey(await lstat(file, { bigint: true })) !== key) throw new Error(`Route output changed during capture: ${relative(file)}`);
}
await readDisposableSession(sessionPath);
await readComparisonSession(comparisonPath);
const output = path.resolve(outputPath);
if (!output.startsWith(`${path.join(repositoryRoot, 'artifacts')}${path.sep}`)
  || Object.values(workspaces).some(workspace => output === workspace || output.startsWith(`${workspace}${path.sep}`))) {
  throw new Error('Output must be a fresh artifact directory outside both build workspaces.');
}
await canonical(path.dirname(output), true);
await mkdir(path.dirname(output), { recursive: true });
await mkdir(output);
for (const { artifact, body } of copies) {
  const destination = path.join(output, artifact);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, body, { flag: 'wx' });
}
const summary = { schemaVersion: 1, artifactType: 'local-next-prerendered-output-envelope', capturedAt: new Date().toISOString(),
  runId: session.runId, unitBytes, productionBilling: false,
  sessions: { source: relative(path.resolve(sessionPath)), comparison: relative(path.resolve(comparisonPath)) }, phases,
  notes: ['Disk files are not Vercel billable objects or measured ISR Writes. All files are rounded independently, including overlapping full RSC and segments.',
    'Flight payloads are opaque. Stable files, complete HTML and companion agreement are local capture checks, not a Vercel storage-format proof.',
    'Cached route bodies and metadata are included in deployment output; the homepage is reported separately from other routes and deployment effects.'] };
await writeFile(path.join(output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ output: relative(output), runId: session.runId, productionBilling: false,
  phases: Object.fromEntries(Object.entries(phases).map(([phase, value]) => [phase, { totals: value.totals, homepage: value.homepage }])) }));

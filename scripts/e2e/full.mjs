import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

// Failure boundaries: each project owns its database and reports; one failure
// cannot hide another project, and interruption must let every runner clean up.
const root = path.resolve(import.meta.dirname, '../..');
const projects = ['chromium', 'mobile-chromium', 'webkit', 'mobile-webkit'];
const args = process.argv.slice(2);
if (args.some(arg => arg === '--project' || arg.startsWith('--project='))) {
  throw new Error('Full acceptance runs all four projects; use run.mjs for a single project.');
}
const output = path.join(root, 'artifacts/e2e-full', randomBytes(6).toString('hex'));
await mkdir(output, { recursive: true });
const children = new Set();
const results = [];
let interrupted = false;
let nextProject = 0;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  interrupted = true;
  for (const child of children) child.kill('SIGTERM');
});
async function runProject(project) {
  const command = ['scripts/e2e/run.mjs', '--grep-invert', '@visual', `--project=${project}`, ...args];
  const log = createWriteStream(path.join(output, `${project}.log`));
  const child = spawn(process.execPath, command, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  console.log(`Full acceptance started: ${project}`);
  const exitCode = await new Promise(resolve => {
    child.once('error', error => { log.write(`${error.message}\n`); resolve(1); });
    child.once('close', code => resolve(code ?? 130));
  });
  children.delete(child);
  await new Promise(resolve => log.end(resolve));
  const text = await readFile(path.join(output, `${project}.log`), 'utf8');
  const runId = text.match(/E2E run ([0-9a-f]+);/)?.[1];
  let stats;
  let evidenceError;
  try {
    if (!runId) throw new Error('Missing run identity');
    const report = JSON.parse(await readFile(path.join(root, 'artifacts/e2e', runId, 'results.json'), 'utf8'));
    stats = report.stats;
    if (!stats || stats.expected <= 0 || stats.unexpected || stats.flaky || report.errors?.length) {
      throw new Error('Acceptance report contains failures or no passing tests');
    }
  } catch (error) { evidenceError = error.message; }
  results.push({ project, command: [process.execPath, ...command], runId, exitCode, stats, evidenceError });
  console.log(`Full acceptance finished: ${project}; ${exitCode === 0 && !evidenceError ? 'passed' : 'failed'}`);
}
async function worker() {
  while (!interrupted && nextProject < projects.length) await runProject(projects[nextProject++]);
}
// Two independent runners bound local memory while retaining suite isolation.
await Promise.all([worker(), worker()]);
const passed = !interrupted && results.length === projects.length && results.every(result => result.exitCode === 0 && !result.evidenceError);
await writeFile(path.join(output, 'summary.json'), JSON.stringify({ passed, interrupted, projects, results }, null, 2));
console.log(`Full acceptance summary: ${output}/summary.json`);
process.exitCode = interrupted ? 130 : passed ? 0 : 1;

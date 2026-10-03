import { spawn, spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

// Failure boundaries: connection refusal and a response body that never ends
// must fail within a deadline, leave no successful capture or browser process,
// and never require developer or production services or data.
const root = process.cwd();
const output = path.resolve(process.argv[2] ?? 'artifacts/usage/browser-capture-verification');
const workspace = await mkdtemp(path.join(os.tmpdir(), 'lilink-capture-failure-'));
const runId = '000000000001';
const results = [];
const processes = () => {
  const result = spawnSync('ps', ['-axo', 'pid=,ppid=,pgid='], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Process inspection is required for cleanup verification.');
  return result.stdout.trim().split('\n').map(line => {
    const [pid, parent, group] = line.trim().split(/\s+/).map(Number);
    return { pid, parent, group };
  });
};
try {
  await mkdir(output, { recursive: true });
  for (const directory of ['scripts/usage', 'scripts/performance', `artifacts/e2e/${runId}`]) {
    await mkdir(path.join(workspace, directory), { recursive: true });
  }
  for (const file of ['scripts/usage/capture-browser.mjs', 'scripts/performance/local-session.mjs']) {
    await copyFile(path.join(root, file), path.join(workspace, file));
  }
  await symlink(path.join(root, 'node_modules'), path.join(workspace, 'node_modules'), 'dir');
  for (const fault of ['connection-refused', 'unfinished-response-body']) {
    const requests = [];
    let partialBodyDelivered = false;
    const server = http.createServer((request, response) => {
      requests.push(new URL(request.url, 'http://127.0.0.1').pathname);
      response.writeHead(200, { 'Content-Type': 'text/html', 'Content-Length': '1000' });
      response.write('<!doctype html><html><body>Unfinished synthetic response');
      partialBodyDelivered = true;
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const closeServer = async () => {
      if (!server.listening) return;
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    };
    if (fault === 'connection-refused') await closeServer();
    const sessionPath = path.join(workspace, `artifacts/e2e/${runId}/session.json`);
    await writeFile(sessionPath, JSON.stringify({ runId, webUrl: origin, apiUrl: origin,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      purpose: 'Synthetic collector transport failure fixture; no application or database session.' }));
    const capturePath = path.join(workspace, fault);
    const started = Date.now();
    const child = spawn(process.execPath, ['scripts/usage/capture-browser.mjs', sessionPath, capturePath], {
      cwd: workspace, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const observed = new Set();
    let stderr = ''; let forced = false;
    child.stdout.resume();
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-8000); });
    const inspect = () => {
      const rows = processes();
      for (let pass = 0; pass < rows.length; pass++) {
        const previous = observed.size;
        for (const row of rows) if (row.pid !== child.pid
          && (row.group === child.pid || row.parent === child.pid || observed.has(row.parent))) observed.add(row.pid);
        if (previous === observed.size) break;
      }
    };
    const interval = setInterval(inspect, 100);
    const deadline = setTimeout(() => {
      forced = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* The process may have just exited. */ }
    }, 15_000);
    try {
      const { code, signal } = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('close', (code, signal) => resolve({ code, signal }));
      });
      clearInterval(interval); clearTimeout(deadline); inspect();
      const durationMs = Date.now() - started;
      const survivingChildren = processes().filter(row => row.group === child.pid || observed.has(row.pid));
      const successfulCapture = await readFile(path.join(capturePath, 'browser-usage.json')).then(() => true, () => false);
      const expectedFailure = fault === 'connection-refused' ? stderr.includes('ECONNREFUSED')
        : /TimeoutError|AbortError/.test(stderr) && partialBodyDelivered && requests.length === 1;
      const passed = !forced && code !== 0 && code !== null && expectedFailure
        && !successfulCapture && survivingChildren.length === 0 && durationMs < 15_000;
      results.push({ fault, passed, exitCode: code, signal, durationMs, deadlineMs: 15_000,
        partialBodyDelivered, requestCount: requests.length, successfulCapture,
        observedChildProcesses: observed.size, survivingChildProcesses: survivingChildren.length,
        expectedFailure, forcedTermination: forced });
      for (const row of survivingChildren) {
        try { process.kill(row.pid, 'SIGKILL'); } catch { /* Already gone. */ }
      }
    } finally {
      clearInterval(interval); clearTimeout(deadline);
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Normal completion leaves no group. */ }
      await closeServer();
    }
  }
} finally { await rm(workspace, { recursive: true, force: true }); }
const report = { command: 'node scripts/usage/verify-browser-capture.mjs', runtime: process.version,
  environment: 'Copied collector in a disposable workspace, synthetic canonical metadata, temporary loopback HTTP listener, installed Playwright dependency; no application database, developer services or production requests.',
  passed: results.length === 2 && results.every(result => result.passed), results };
await writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed: report.passed, results, artifact: path.join(output, 'report.json') }, null, 2));
if (!report.passed) process.exitCode = 1;

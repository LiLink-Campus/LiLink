import { spawn } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

// Failure boundaries: no-scroll and early-exit paths must not scroll or await
// the high-resolution image; full/revisit paths must load the distant image.
// Interrupted requests remain explicit rather than silently disappearing.
const root = process.cwd();
const output = path.resolve(process.argv[2] ?? 'artifacts/usage/home-journey-verification');
const workspace = await mkdtemp(path.join(os.tmpdir(), 'lilink-home-journeys-'));
const runId = '000000000002';
const delayed = new Set();
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="pink"/></svg>';
const home = `<!doctype html><html><body><main><h1>让相遇这件事 值得被认真对待</h1>
<a href="/register">立即加入</a><a href="/about">了解更多</a>
<div data-home-hero style="width:400px;height:200px;background-image:linear-gradient(pink,pink)">
<img src="/hero.svg" fetchpriority="high" width="400" height="200"></div>
<ul aria-label="各学校已加入人数"><li>合成学校</li></ul>
<div style="height:6000px"></div><img src="/distant.svg" loading="lazy" width="400" height="200">
</main><script>navigator.serviceWorker.register('/sw.js');</script></body></html>`;
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (pathname === '/sw.js') {
    response.writeHead(200, { 'Content-Type': 'application/javascript' });
    response.end("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));");
  } else if (pathname.endsWith('.svg')) {
    const send = () => { delayed.delete(timer); response.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public,max-age=3600' }); response.end(svg); };
    const timer = pathname === '/hero.svg' ? setTimeout(send, 7000) : null;
    if (timer) { delayed.add(timer); response.on('close', () => { clearTimeout(timer); delayed.delete(timer); }); }
    else send();
  } else {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(pathname === '/about' ? '<!doctype html><html><body><main><h1>关于 LiLink</h1></main></body></html>' : home);
  }
});
let child;
try {
  await mkdir(output, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const directory of ['scripts/usage', 'scripts/performance', `artifacts/e2e/${runId}/workspace/apps/web/.next`]) {
    await mkdir(path.join(workspace, directory), { recursive: true });
  }
  for (const file of ['scripts/usage/capture-browser.mjs', 'scripts/performance/local-session.mjs']) {
    await copyFile(path.join(root, file), path.join(workspace, file));
  }
  await symlink(path.join(root, 'node_modules'), path.join(workspace, 'node_modules'), 'dir');
  const sessionPath = path.join(workspace, `artifacts/e2e/${runId}/session.json`);
  await writeFile(path.join(workspace, `artifacts/e2e/${runId}/workspace/apps/web/.next/BUILD_ID`), 'synthetic-home-journey-build');
  await writeFile(sessionPath, JSON.stringify({ runId, webUrl: origin, apiUrl: 'http://127.0.0.1:1',
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() }));
  child = spawn(process.execPath, ['scripts/usage/capture-browser.mjs', sessionPath, output, '--home-journeys'], {
    cwd: workspace, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = ''; let forced = false;
  child.stdout.resume();
  child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString()).slice(-8000); });
  const deadline = setTimeout(() => { forced = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 90_000);
  const { code, signal } = await new Promise((resolve, reject) => {
    child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal }));
  }).finally(() => clearTimeout(deadline));
  const evidence = await readFile(path.join(output, 'browser-usage.json'), 'utf8').then(JSON.parse, () => null);
  const results = ['desktop', 'mobile'].flatMap(viewport => {
    const sample = scenario => evidence?.samples.find(row => row.viewport === viewport && row.scenario === scenario);
    const stay = sample('cold-home-stay'); const leave = sample('cold-home-leave');
    const full = sample('cold-home-full'); const revisit = sample('warm-home-revisit');
    return [
      { viewport, name: 'stay-does-not-scroll-or-wait-for-hd', passed: !!stay && stay.journeyObservation.scrollY === 0
        && !stay.resources.some(row => row.path === '/distant.svg') && stay.durationMs < 6500 },
      { viewport, name: 'leave-immediately-before-hd', passed: !!leave && leave.journeyObservation.destination === '/about'
        && !leave.resources.some(row => row.path === '/distant.svg') && leave.durationMs < 6500
        && leave.resources.some(row => row.path === '/hero.svg' && ['incomplete', 'failed'].includes(row.completion)) },
      { viewport, name: 'full-and-revisit-load-distant-image', passed: !!full && !!revisit
        && full.resources.some(row => row.path === '/distant.svg')
        && revisit.resources.some(row => row.path === '/distant.svg') },
    ];
  });
  const passed = code === 0 && !forced && evidence?.samples.length === 8
    && evidence.buildId === 'synthetic-home-journey-build' && results.every(row => row.passed);
  const report = { command: 'node scripts/usage/verify-home-journeys.mjs', runtime: process.version,
    environment: 'Isolated Chromium and synthetic loopback HTML in a copied collector workspace; no application, database or production services.',
    passed, exitCode: code, signal, forced, stderr, results };
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed, results, artifact: path.join(output, 'report.json') }));
  if (!passed) process.exitCode = 1;
} finally {
  if (child?.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
  for (const timer of delayed) clearTimeout(timer);
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await rm(workspace, { recursive: true, force: true });
}

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { cp, mkdir, readdir, symlink, writeFile, rm, access } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { testEnvironment } from './environment.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const apiOnly = process.argv.includes('--api');
const serve = process.argv.includes('--serve');
const serveMinutesArg = process.argv.find(arg => arg.startsWith('--serve-minutes='));
const serveMinutes = Number(serveMinutesArg?.split('=')[1] ?? 30);
if ((serve && apiOnly) || (serveMinutesArg && !serve) || !Number.isInteger(serveMinutes) || serveMinutes < 1 || serveMinutes > 30) {
  throw new Error('--serve is browser-only; --serve-minutes must be between 1 and 30.');
}
const playwrightArgs = process.argv.slice(2).filter(arg => arg !== '--serve' && !arg.startsWith('--serve-minutes='));
const startedAt = Date.now();
const runId = randomBytes(6).toString('hex');
const output = path.join(root, 'artifacts/e2e', runId);
const workspace = path.join(output, 'workspace');
const children = new Set();
const containers = [];
let stopping = false;
let interrupted = false;
let releaseSession;
const interruptedSession = new Promise(resolve => { releaseSession = resolve; });
await mkdir(workspace, { recursive: true });
await writeFile(path.join(root, 'artifacts/e2e/latest.json'), JSON.stringify({ runId, output }, null, 2));

function command(exe, args, options = {}) {
  const { background = false, label, ...spawnOptions } = options;
  if (interrupted && label !== 'cleanup') throw new Error('Run interrupted.');
  const child = spawn(exe, args, { cwd: workspace, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'], ...spawnOptions });
  children.add(child);
  const log = createWriteStream(path.join(output, `${label || exe.replaceAll('/', '_')}.log`), { flags: 'a' });
  child.stdout.pipe(log); child.stderr.pipe(log);
  if (!background) { child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr); }
  child.done = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code, signal) => { children.delete(child); log.end(); code === 0 ? resolve() : reject(new Error(`${exe} failed (${code ?? signal}); see ${output}`)); });
  });
  child.done.catch(() => {});
  return background ? child : child.done;
}
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
async function waitFor(url, child, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (interrupted || child.exitCode !== null || child.signalCode !== null) throw new Error(`Service exited before readiness: ${url}`);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`Readiness timeout: ${url}`);
}
async function linkDependencies(source, target, rootModules = false) {
  try { await access(source); } catch { return; }
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source)) {
    if (rootModules && ['@lilink', 'api', 'web'].includes(entry)) continue;
    await symlink(path.join(source, entry), path.join(target, entry));
  }
  if (rootModules) {
    await mkdir(path.join(target, '@lilink'));
    await symlink(path.join(workspace, 'packages/shared'), path.join(target, '@lilink/shared'));
    for (const name of ['api', 'web']) await symlink(path.join(workspace, 'apps', name), path.join(target, name));
  }
}
async function cleanup() {
  if (stopping) return;
  stopping = true;
  const live = [...children];
  for (const child of live) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
  await Promise.race([Promise.allSettled(live.map(child => child.done)), new Promise(resolve => setTimeout(resolve, 3000))]);
  for (const child of live) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
  for (const name of containers.reverse()) {
    try { await command('docker', ['rm', '-fv', name], { label: 'cleanup' }); }
    catch (error) { console.error(`Cleanup failed for ${name}: ${error.message}`); process.exitCode = 1; }
  }
  await rm(path.join(output, 'session.json'), { force: true });
  await rm(workspace, { recursive: true, force: true });
}
const ports = [];
while (ports.length < 5) { const port = await freePort(); if (!ports.includes(port) && port !== 5432) ports.push(port); }
const [dbPort, smtpPort, mailPort, apiPort, webPort] = ports;
const env = testEnvironment({ dbPort, smtpPort, mailPort, apiPort, webPort, runId });
if (apiOnly) env.DATABASE_URL = env.DATABASE_URL.replace('/lilink_e2e_', '/lilink_vip_test_');
Object.assign(env, { E2E_SOURCE_ROOT: root, E2E_OUTPUT: output, E2E_WORKSPACE: workspace, LILINK_BUILD_WORKSPACE_ROOT: root });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  interrupted = true;
  process.exitCode = 130;
  releaseSession();
  for (const child of children) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
});

try {
  console.log(`E2E run ${runId}; reports: ${output}`);
  await command('docker', ['info', '--format', '{{.ServerVersion}}'], { label: 'infra' });
  const excluded = new Set(['node_modules', '.next', 'dist', 'coverage', 'storybook-static', '.git', 'generated']);
  for (const entry of ['package.json', 'package-lock.json', 'apps', 'packages', 'scripts', 'e2e', 'playwright.config.ts']) {
    await cp(path.join(root, entry), path.join(workspace, entry), {
      recursive: true,
      filter: source => !excluded.has(path.basename(source)) && !path.basename(source).startsWith('.env') && !source.endsWith('.tsbuildinfo'),
    });
  }
  await linkDependencies(path.join(root, 'node_modules'), path.join(workspace, 'node_modules'), true);
  for (const name of ['api', 'web']) await linkDependencies(path.join(root, 'apps', name, 'node_modules'), path.join(workspace, 'apps', name, 'node_modules'));
  const dbName = `lilink-e2e-db-${runId}`;
  containers.push(dbName);
  await command('docker', ['run', '-d', '--name', dbName, '--label', `lilink.e2e=${runId}`, '-p', `127.0.0.1:${dbPort}:5432`, '-e', `POSTGRES_DB=${apiOnly ? 'lilink_vip_test' : 'lilink_e2e'}_${runId}`, '-e', 'POSTGRES_USER=e2e', '-e', 'POSTGRES_PASSWORD=e2e', '--tmpfs', '/var/lib/postgresql/data:rw', 'postgres:17-alpine'], { label: 'infra' });
  const mailName = `lilink-e2e-mail-${runId}`;
  containers.push(mailName);
  await command('docker', ['run', '-d', '--name', mailName, '--label', `lilink.e2e=${runId}`, '-p', `127.0.0.1:${smtpPort}:1025`, '-p', `127.0.0.1:${mailPort}:8025`, 'ghcr.io/axllent/mailpit:v1.20'], { label: 'infra' });
  for (let attempt = 0; ; attempt++) {
    try { await command('docker', ['exec', dbName, 'pg_isready', '-U', 'e2e'], { label: 'infra' }); break; }
    catch (error) { if (attempt === 30) throw error; await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  await command('npm', ['run', 'build:shared'], { label: 'build' });
  await command('npm', ['run', 'db:migrate:deploy'], { label: 'migrate' });
  await command('npm', ['run', 'build:api'], { label: 'build' });
  if (apiOnly) {
    await command('npm', ['run', 'test:e2e', '--workspace', 'api', '--', '--runInBand', ...process.argv.slice(2).filter(arg => arg !== '--api')], { label: 'tests' });
  } else {
  await command('node', ['apps/api/scripts/seed-defaults.mjs'], { label: 'seed' });
  await command('node', ['e2e/support/seed.mjs'], { label: 'seed' });
  const api = command('node', ['apps/api/dist/src/main.js'], { background: true, label: 'api' });
  // Public prerendering must read the seeded API, not cache a connection failure.
  await waitFor(`${env.E2E_API_URL}/health`, api);
  await Promise.race([
    command('npm', ['run', 'build:web'], { label: 'build' }),
    api.done.then(() => { throw new Error('The isolated API exited during the web build.'); }),
  ]);
  const web = command('npm', ['run', 'start', '--workspace', 'web', '--', '--hostname', '127.0.0.1', '--port', String(webPort)], { background: true, label: 'web' });
  await Promise.all([waitFor(`${env.E2E_API_URL}/health`, api), waitFor(`${env.E2E_WEB_URL}/login`, web), waitFor(`${env.E2E_MAIL_URL}/api/v1/messages`, api)]);
  const services = [api, web, ...containers.map(name => command('docker', ['wait', name], { background: true, label: 'service-watch' }))];
  const serviceFailure = Promise.race(services.map(child => child.done.then(() => { throw new Error('An isolated service exited unexpectedly.'); })));
  serviceFailure.catch(() => {});
  if (serve) {
    const expiresAt = new Date(Date.now() + serveMinutes * 60_000).toISOString();
    await writeFile(path.join(output, 'session.json'), JSON.stringify({ runId, pid: process.pid,
      webUrl: env.E2E_WEB_URL, apiUrl: env.E2E_API_URL, mailUrl: env.E2E_MAIL_URL, expiresAt }, null, 2));
    console.log(`Isolated browser session ready: ${env.E2E_WEB_URL}; expires ${expiresAt}`);
    let expiry;
    try {
      await Promise.race([serviceFailure, interruptedSession,
        new Promise(resolve => { expiry = setTimeout(resolve, serveMinutes * 60_000); })]);
    } finally { clearTimeout(expiry); }
  } else {
    await Promise.race([command('npx', ['playwright', 'test', ...playwrightArgs], { label: 'tests' }), serviceFailure]);
  }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = interrupted ? 130 : 1;
} finally {
  await cleanup();
  await writeFile(path.join(output, 'run.json'), JSON.stringify({ runId, startedAt: new Date(startedAt).toISOString(), durationMs: Date.now() - startedAt, exitCode: process.exitCode || 0, arguments: process.argv.slice(2), platform: process.platform, arch: process.arch }, null, 2));
  console.log(`E2E artifacts: ${output}`);
}

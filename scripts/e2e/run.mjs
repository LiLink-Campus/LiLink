import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { cp, mkdir, readdir, symlink, writeFile, rm, access } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { testEnvironment } from './environment.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const startedAt = Date.now();
const runId = randomBytes(6).toString('hex');
const output = path.join(root, 'artifacts/e2e', runId);
const workspace = path.join(output, 'workspace');
const children = new Set();
const containers = [];
let stopping = false;
await mkdir(workspace, { recursive: true });
await writeFile(path.join(root, 'artifacts/e2e/latest.json'), JSON.stringify({ runId, output }, null, 2));

function command(exe, args, options = {}) {
  const { background = false, label, ...spawnOptions } = options;
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
    if (child.exitCode !== null) throw new Error(`Service exited before readiness: ${url}`);
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
  await rm(workspace, { recursive: true, force: true });
}
const ports = [];
while (ports.length < 5) { const port = await freePort(); if (!ports.includes(port) && port !== 5432) ports.push(port); }
const [dbPort, smtpPort, mailPort, apiPort, webPort] = ports;
const env = testEnvironment({ dbPort, smtpPort, mailPort, apiPort, webPort, runId });
Object.assign(env, { E2E_SOURCE_ROOT: root, E2E_OUTPUT: output, E2E_WORKSPACE: workspace, LILINK_BUILD_WORKSPACE_ROOT: root });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void cleanup().finally(() => process.exit(130)); });

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
  await command('docker', ['run', '-d', '--name', dbName, '--label', `lilink.e2e=${runId}`, '-p', `127.0.0.1:${dbPort}:5432`, '-e', `POSTGRES_DB=lilink_e2e_${runId}`, '-e', 'POSTGRES_USER=e2e', '-e', 'POSTGRES_PASSWORD=e2e', '--tmpfs', '/var/lib/postgresql/data:rw', 'postgres:17-alpine'], { label: 'infra' });
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
  await command('node', ['apps/api/scripts/seed-defaults.mjs'], { label: 'seed' });
  await command('node', ['e2e/support/seed.mjs'], { label: 'seed' });
  await command('npm', ['run', 'build:web'], { label: 'build' });
  const api = command('node', ['apps/api/dist/src/main.js'], { background: true, label: 'api' });
  const web = command('npm', ['run', 'start', '--workspace', 'web', '--', '--hostname', '127.0.0.1', '--port', String(webPort)], { background: true, label: 'web' });
  await Promise.all([waitFor(`${env.E2E_API_URL}/health`, api), waitFor(`${env.E2E_WEB_URL}/login`, web), waitFor(`${env.E2E_MAIL_URL}/api/v1/messages`, api)]);
  await command('npx', ['playwright', 'test', ...process.argv.slice(2)], { label: 'tests' });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await cleanup();
  await writeFile(path.join(output, 'run.json'), JSON.stringify({ runId, startedAt: new Date(startedAt).toISOString(), durationMs: Date.now() - startedAt, exitCode: process.exitCode || 0, arguments: process.argv.slice(2), platform: process.platform, arch: process.arch }, null, 2));
  console.log(`E2E artifacts: ${output}`);
}

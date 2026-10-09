import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { cp, mkdir, readdir, symlink, writeFile, readFile, rm, access } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { testEnvironment } from './environment.mjs';
import { startContractProxy } from './contract-proxy.mjs';
import { startDevlogFixture } from './devlog-fixture.mjs';
import { saveBuildRouteSummary } from './build-route-summary.mjs';
import { sourceState } from '../source-state.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ci = process.argv.includes('--ci');
const apiOnly = process.argv.includes('--api');
const buildOnly = process.argv.includes('--build-only');
const serve = process.argv.includes('--serve');
const contractProxy = !apiOnly && !process.argv.includes('--build-only');
let proxy;
let devlog;
const devlogModeArg = process.argv.find(arg => arg.startsWith('--devlog-fixture='));
const devlogMode = devlogModeArg?.slice('--devlog-fixture='.length) ?? (apiOnly ? undefined : 'items');
if (devlogModeArg && (!['items', 'empty', 'failure', 'malformed'].includes(devlogMode) || apiOnly)) {
  throw new Error('--devlog-fixture requires browser mode and items, empty, failure or malformed.');
}
const sentryTracing = process.argv.includes('--sentry-tracing');
const reuseApiBuild = ci || process.argv.includes('--reuse-api-build');
const serveMinutesArg = process.argv.find(arg => arg.startsWith('--serve-minutes='));
const serveMinutes = Number(serveMinutesArg?.split('=')[1] ?? 30);
const extraOriginArgs = process.argv.filter(arg => arg.startsWith('--extra-client-origin='));
const extraOriginArg = extraOriginArgs[0];
const extraOrigin = extraOriginArg?.slice('--extra-client-origin='.length);
if (extraOriginArgs.length > 1 || (extraOriginArg && !extraOrigin)) {
  throw new Error('--extra-client-origin must be supplied at most once with a nonempty origin.');
}
if (extraOrigin) {
  const url = new URL(extraOrigin);
  if (!serve || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.origin !== extraOrigin) {
    throw new Error('--extra-client-origin requires --serve and an exact loopback HTTP origin.');
  }
}
if ((contractProxy && (apiOnly || buildOnly)) || (serve && apiOnly) || (sentryTracing && apiOnly) || (buildOnly && (serve || apiOnly)) || (serveMinutesArg && !serve) || !Number.isInteger(serveMinutes) || serveMinutes < 1 || serveMinutes > 90) {
  throw new Error('--serve is browser-only; --serve-minutes must be between 1 and 90.');
}
const playwrightArgs = process.argv.slice(2).filter(arg => !['--reuse-api-build', '--ci', '--serve', '--build-only', '--sentry-tracing', '--contract-proxy'].includes(arg) && !arg.startsWith('--serve-minutes=') && !arg.startsWith('--extra-client-origin=') && !arg.startsWith('--devlog-fixture='));
if (buildOnly && playwrightArgs.length) throw new Error('--build-only does not accept browser test arguments.');
const source = sourceState(root);
const startedAt = Date.now();
const runId = randomBytes(6).toString('hex');
const output = path.join(root, 'artifacts/e2e', runId);
const workspace = path.join(output, 'workspace');
const children = new Set();
const containers = [];
let stopPromise;
let env;
let interrupted = false;
let releaseSession;
const interruptedSession = new Promise(resolve => { releaseSession = resolve; });

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
function stopChildren() {
  stopPromise ??= terminateChildren();
  return stopPromise;
}
async function terminateChildren() {
  const live = [...children];
  for (const child of live) { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
  let deadline;
  try {
    await Promise.race([Promise.allSettled(live.map(child => child.done)), new Promise(resolve => { deadline = setTimeout(resolve, 3000); })]);
  } finally { clearTimeout(deadline); }
  for (const child of live) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
  await Promise.allSettled(live.map(child => child.done));
}
async function cleanup() {
  await stopChildren();
  await proxy?.close();
  await devlog?.close();
  for (const name of containers.reverse()) {
    try { await command('docker', ['rm', '-fv', name], { label: 'cleanup' }); }
    catch (error) { console.error(`Cleanup failed for ${name}: ${error.message}`); process.exitCode = 1; }
  }
  await rm(path.join(output, 'session.json'), { force: true });
  await rm(workspace, { recursive: true, force: true });
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  interrupted = true;
  process.exitCode = 130;
  releaseSession();
  // Finish asynchronous initialization before removing its resources in finally.
  void stopChildren();
});

try {
  await mkdir(workspace, { recursive: true });
  await writeFile(path.join(root, 'artifacts/e2e/latest.json'), JSON.stringify({ runId, output }, null, 2));
  const ports = [];
  while (ports.length < (sentryTracing ? 6 : 5)) { const port = await freePort(); if (!ports.includes(port) && port !== 5432) ports.push(port); }
  const [dbPort, smtpPort, mailPort, apiPort, webPort, sentryPort] = ports;
  env = testEnvironment({ dbPort, smtpPort, mailPort, apiPort, webPort, runId, sentryPort });
  if (extraOrigin) env.CLIENT_ORIGIN += `,${extraOrigin}`;
  if (apiOnly || ci) env.DATABASE_URL = env.DATABASE_URL.replace('/lilink_e2e_', '/lilink_vip_test_');
  Object.assign(env, { E2E_SOURCE_ROOT: root, E2E_OUTPUT: output, E2E_WORKSPACE: workspace, LILINK_BUILD_WORKSPACE_ROOT: root });
  console.log(`E2E run ${runId}; reports: ${output}`);
  if (devlogMode) {
    devlog = await startDevlogFixture(devlogMode);
    env.DEVLOG_BASE_URL = devlog.url;
    env.E2E_DEVLOG_MODE = devlogMode;
    env.E2E_DEVLOG_FIXTURE_URL = devlog.url;
  }
  await command('docker', ['info', '--format', '{{.ServerVersion}}'], { label: 'infra' });
  const excluded = new Set(['node_modules', '.next', 'dist', 'coverage', 'storybook-static', '.git', 'generated', 'static-assets.lock']);
  for (const entry of ['package.json', 'package-lock.json', 'apps', 'packages', 'scripts', 'e2e', 'playwright.config.ts']) {
    await cp(path.join(root, entry), path.join(workspace, entry), {
      recursive: true,
      filter: source => !excluded.has(path.basename(source)) && !path.basename(source).startsWith('.env') && !source.endsWith('.tsbuildinfo'),
    });
    if (interrupted) throw new Error('Run interrupted.');
  }
  const copiedSource = sourceState(root);
  source.sourceDirty ||= copiedSource.sourceDirty || copiedSource.sourceSha !== source.sourceSha;
  await linkDependencies(path.join(root, 'node_modules'), path.join(workspace, 'node_modules'), true);
  for (const name of ['api', 'web']) await linkDependencies(path.join(root, 'apps', name, 'node_modules'), path.join(workspace, 'apps', name, 'node_modules'));
  if (sentryTracing) {
    const collector = command('node', ['scripts/e2e/sentry-collector.mjs', String(sentryPort), env.E2E_WEB_URL,
      path.join(output, 'sentry-events.jsonl')], { background: true, label: 'sentry' });
    await waitFor(`${env.E2E_SENTRY_URL}/health`, collector);
  }
  const dbName = `lilink-e2e-db-${runId}`;
  containers.push(dbName);
  await command('docker', ['run', '-d', '--name', dbName, '--label', `lilink.e2e=${runId}`, '-p', `127.0.0.1:${dbPort}:5432`, '-e', `POSTGRES_DB=${apiOnly || ci ? 'lilink_vip_test' : 'lilink_e2e'}_${runId}`, '-e', 'POSTGRES_USER=e2e', '-e', 'POSTGRES_PASSWORD=e2e', '--tmpfs', '/var/lib/postgresql/data:rw', 'postgres:17-alpine'], { label: 'infra' });
  const mailName = `lilink-e2e-mail-${runId}`;
  containers.push(mailName);
  await command('docker', ['run', '-d', '--name', mailName, '--label', `lilink.e2e=${runId}`, '-p', `127.0.0.1:${smtpPort}:1025`, '-p', `127.0.0.1:${mailPort}:8025`, 'ghcr.io/axllent/mailpit:v1.20'], { label: 'infra' });
  for (let attempt = 0; ; attempt++) {
    try { await command('docker', ['exec', dbName, 'pg_isready', '-U', 'e2e'], { label: 'infra' }); break; }
    catch (error) { if (attempt === 30) throw error; await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  if (contractProxy) {
    const proxyPort = await freePort();
    proxy = await startContractProxy(proxyPort, env.E2E_API_URL);
    env.NEXT_PUBLIC_API_BASE_URL = `http://127.0.0.1:${proxyPort}/v1`;
    env.E2E_CONTRACT_PROXY_URL = `http://127.0.0.1:${proxyPort}`;
    env.E2E_API_URL = env.NEXT_PUBLIC_API_BASE_URL;
  }
  if (reuseApiBuild) {
    for (const entry of ['packages/shared/dist', 'apps/api/dist', 'apps/api/src/generated']) {
      await cp(path.join(root, entry), path.join(workspace, entry), { recursive: true });
    }
  } else await command('npm', ['run', 'build:shared'], { label: 'build' });
  await command('npm', ['run', 'db:migrate:deploy'], { label: 'migrate' });
  if (!reuseApiBuild) await command('npm', ['run', 'build:api'], { label: 'build' });
  if (apiOnly || ci) {
    await command('npx', ['jest', '--config', './test/jest-e2e.json', '--runInBand', '--json', `--outputFile=${path.join(output, 'api-results.json')}`, ...process.argv.slice(2).filter(arg => !['--ci', '--api'].includes(arg))], { cwd: path.join(workspace, 'apps/api'), env: { ...env, NODE_OPTIONS: '--experimental-vm-modules' }, label: 'tests' });
    const result = JSON.parse(await readFile(path.join(output, 'api-results.json'), 'utf8'));
    if (!result.success || result.numPassedTests === 0 || result.numPendingTests || result.numTodoTests) {
      throw new Error('API regression must execute a nonempty collection without skipped tests.');
    }
  }
  if (ci) {
    env.DATABASE_URL = env.DATABASE_URL.replace('/lilink_vip_test_', '/lilink_e2e_');
    await command('docker', ['exec', dbName, 'createdb', '-U', 'e2e', `lilink_e2e_${runId}`], { label: 'infra' });
    await command('npm', ['run', 'db:migrate:deploy'], { label: 'migrate' });
  }
  if (!apiOnly) {
  await command('node', ['apps/api/scripts/seed-defaults.mjs'], { label: 'seed' });
  await command('node', ['e2e/support/seed.mjs'], { label: 'seed' });
  const api = command('node', ['apps/api/dist/src/main.js'], { background: true, label: 'api' });
  env.E2E_API_PID = String(api.pid);
  // Public prerendering must read the seeded API, not cache a connection failure.
  await waitFor(`${env.E2E_API_URL}/health`, api);
  if (buildOnly) await command('npm', ['run', 'typecheck:web'], { label: 'typecheck' });
  await Promise.race([
    command('npm', ['run', 'build:web'], { label: 'build' }),
    api.done.then(() => { throw new Error('The isolated API exited during the web build.'); }),
  ]);
  await saveBuildRouteSummary(workspace, output);
  if (!buildOnly) {
  const web = command('npm', ['run', 'start', '--workspace', 'web', '--', '--hostname', '127.0.0.1', '--port', String(webPort)], { background: true, label: 'web' });
  env.E2E_WEB_PID = String(web.pid);
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
    // Reporter errors may leave Playwright's exit code at zero.
    const result = JSON.parse(await readFile(path.join(output, 'results.json'), 'utf8'));
    if (!result.stats?.expected || result.stats.skipped || result.stats.flaky || result.stats.unexpected || result.errors?.length) {
      throw new Error('Browser regression must execute a nonempty collection without skipped or flaky tests.');
    }
  }
  }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = interrupted ? 130 : 1;
} finally {
  await cleanup();
  await writeFile(path.join(output, 'run.json'), JSON.stringify({ ...source, runId, startedAt: new Date(startedAt).toISOString(), durationMs: Date.now() - startedAt, exitCode: process.exitCode || 0, arguments: process.argv.slice(2), platform: process.platform, arch: process.arch }, null, 2));
  console.log(`E2E artifacts: ${output}`);
}

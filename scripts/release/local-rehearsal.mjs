import { resolveLoadTarget, resolveDatabaseTarget } from './targets.mjs';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, chmod, open } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const artifacts = path.join(root, 'artifacts/questionnaire-release-20260920');
const secretDir = path.join(root, 'artifacts/release-secret');
const outputDir = path.join(root, 'artifacts/release-output');
const label = 'lilink.release=questionnaire-reset-20260920';
const action = process.argv[2];
assert.ok(['start', 'matching', 'evidence', 'stop'].includes(action), 'Use start, matching, evidence or stop.');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const image = `lilink-release-local:${sha}`;
const capture = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim();
const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
});
const mounted = ['--network', 'release-test', '-v', `${secretDir}/api_env:/run/secrets/api_env:ro`, '-v', `${root}/scripts/release:/release:ro`];
const containers = () => capture('docker', ['ps', '-a', '--filter', `label=${label}`, '--format', '{{.Names}}']).split('\n').filter(Boolean);
if (action === 'start') {
  execFileSync('git', ['diff', '--exit-code', 'HEAD', '--', 'apps/api', 'packages/shared', 'scripts/release', '.dockerignore', 'package.json', 'package-lock.json']);
  assert.equal(capture('git', ['ls-files', '--others', '--exclude-standard', '--', 'apps/api', 'packages/shared', 'scripts/release']), '', 'Commit release source files before building.');
  assert.deepEqual(containers(), [], 'Stop the existing task-owned rehearsal first.');
  const caddyBinary = process.env.RELEASE_CADDY_BINARY;
  assert.ok(caddyBinary, 'Set RELEASE_CADDY_BINARY to the verified Caddy 2.11.4 executable.');
  assert.match(capture(caddyBinary, ['version']), /^v2\.11\.4\b/, 'Match the verified production gateway version.');
  const targetFile = process.env.RELEASE_TARGET_FILE ?? `${artifacts}/load-target.json`;
  const connectionFile = process.env.RELEASE_DATABASE_FILE ?? `${artifacts}/load-url`;
  const target = JSON.parse(await readFile(targetFile, 'utf8'));
  const verified = resolveLoadTarget(target);
  const database = (await readFile(connectionFile, 'utf8')).trim();
  assert.deepEqual(resolveDatabaseTarget(database), verified);
  const url = new URL(database);
  console.log(JSON.stringify({ target: { projectId: target.projectId, branchId: target.branchId, host: url.hostname, database: verified.database, role: verified.role }, release: sha, cpus: 2, memoryMiB: 3584, architecture: capture('docker', ['info', '--format', '{{.Architecture}}']) }));
  for (const dir of [secretDir, outputDir]) { await mkdir(dir, { recursive: true, mode: 0o700 }); await chmod(dir, 0o700); }
  await run(process.execPath, ['scripts/release/runner-env.mjs'], { env: { ...process.env, RELEASE_DB: database, RELEASE_KEY: (await readFile(`${artifacts}/load-access-key`, 'utf8')).trim(), TUNNEL_TOKEN: (await readFile(`${artifacts}/tunnel-token`, 'utf8')).trim() } });
  await writeFile(`${artifacts}/local-load-target.json`, JSON.stringify({ ...target, baseUrl: 'http://127.0.0.1:4080' }, null, 2));
  await run('docker', ['build', '-f', 'apps/api/Dockerfile.prod', '--build-arg', `SENTRY_RELEASE=${sha}`, '--label', `org.opencontainers.image.revision=${sha}`, '-t', image, '.']);
  await run('docker', ['network', 'create', '--label', label, 'release-test']);
  await run('docker', ['run', '-d', '--name', 'release-mail', '--label', label, '--network', 'release-test', '-p', '127.0.0.1:18026:8025', 'ghcr.io/axllent/mailpit:v1.20', '--max', '20000']);
  await run('docker', ['run', '--rm', ...mounted, image, 'node', 'scripts/production-entrypoint.mjs', 'npx', 'prisma', 'migrate', 'deploy']);
  await run('docker', ['run', '--rm', '--user', '0', ...mounted, '-v', `${outputDir}:/release-output`, image, 'node', 'scripts/production-entrypoint.mjs', 'node', '/release/seed-load.mjs']);
  await run('docker', ['run', '-d', '--name', 'release-api', '--label', label, ...mounted, '--cpus=2', '--memory=3584m', '--memory-swap=5632m', '-p', '127.0.0.1:4120:4000', '-e', 'NODE_OPTIONS=--enable-source-maps --require /release/observe.cjs', image]);
  const proxyLog = await open(`${outputDir}/requests.jsonl`, 'a');
  const proxy = spawn(process.execPath, ['scripts/release/proxy.mjs'], { detached: true, stdio: ['ignore', proxyLog.fd, proxyLog.fd], env: { ...process.env, GITHUB_SHA: sha, RELEASE_ACCESS_FILE: `${secretDir}/access-key`, RELEASE_API_PORT: '4120', RELEASE_PROXY_PORT: '4081', RELEASE_TARGET_FILE: `${artifacts}/local-load-target.json` } });
  await writeFile(`${outputDir}/proxy.pid`, String(proxy.pid));
  proxy.unref();
  await proxyLog.close();
  const caddyConfig = `${artifacts}/Caddyfile`;
  await writeFile(caddyConfig, '{\n admin off\n auto_https off\n}\n:4080 {\n bind 127.0.0.1\n encode zstd gzip\n reverse_proxy 127.0.0.1:4081\n}\n');
  await run(caddyBinary, ['validate', '--config', caddyConfig, '--adapter', 'caddyfile']);
  const caddyLog = await open(`${artifacts}/caddy.log`, 'a');
  const caddy = spawn(caddyBinary, ['run', '--config', caddyConfig, '--adapter', 'caddyfile'], { detached: true, stdio: ['ignore', caddyLog.fd, caddyLog.fd] });
  await writeFile(`${artifacts}/caddy.pid`, String(caddy.pid));
  caddy.unref();
  await caddyLog.close();
  for (let attempt = 0; ; attempt++) {
    try { assert.equal((await fetch('http://127.0.0.1:4120/v1/health', { signal: AbortSignal.timeout(2000) })).status, 200); break; }
    catch (error) { if (attempt >= 30) throw error; await new Promise(resolve => setTimeout(resolve, 1000)); }
  }
  const gateway = await fetch('http://127.0.0.1:4080/__release', { headers: { 'x-release-access': (await readFile(`${secretDir}/access-key`, 'utf8')).trim() }, signal: AbortSignal.timeout(2000) });
  assert.equal(gateway.status, 200);
  assert.equal((await gateway.json()).release, sha);
  console.log('Isolated API ready on loopback 4120; Caddy compression and authenticated load proxy on 4080.');
} else if (action === 'matching') {
  assert.ok(containers().includes('release-api'));
  assert.equal(capture('docker', ['inspect', '--format', '{{.Config.Image}}', 'release-api']), image);
  await run('docker', ['run', '--rm', ...mounted, '-v', `${outputDir}:/release-output:ro`, '-e', `SENTRY_RELEASE=${sha}`, image, 'node', 'scripts/production-entrypoint.mjs', 'node', '/release/matching-rehearsal.mjs']);
} else if (action === 'evidence') {
  assert.ok(containers().includes('release-api'));
  const runningImage = capture('docker', ['inspect', '--format', '{{.Config.Image}}', 'release-api']);
  const runningRelease = capture('docker', ['image', 'inspect', '--format', '{{index .Config.Labels "org.opencontainers.image.revision"}}', runningImage]);
  assert.match(runningRelease, /^[a-f0-9]{40}$/);
  assert.equal(runningImage, `lilink-release-local:${runningRelease}`);
  const evidence = { release: runningRelease, sourceHead: sha, image: runningImage, state: JSON.parse(capture('docker', ['inspect', '--format', '{{json .State}}', 'release-api'])), resources: JSON.parse(capture('docker', ['stats', '--no-stream', '--format', '{{json .}}', 'release-api'])) };
  await writeFile(`${outputDir}/container-state.json`, JSON.stringify(evidence, null, 2));
  const logs = spawnSync('docker', ['logs', 'release-api'], { encoding: 'utf8' });
  assert.equal(logs.status, 0, 'Could not collect API stdout and stderr.');
  await writeFile(`${outputDir}/api.log`, (logs.stdout ?? '') + (logs.stderr ?? ''));
  console.log(JSON.stringify(evidence));
} else {
  try {
    const pid = Number(await readFile(`${artifacts}/caddy.pid`, 'utf8'));
    const command = capture('ps', ['-p', String(pid), '-o', 'command=']);
    if (command.includes('caddy run') && command.includes(`${artifacts}/Caddyfile`)) process.kill(pid, 'SIGTERM');
  } catch { /* Already stopped. */ }
  try {
    const pid = Number(await readFile(`${outputDir}/proxy.pid`, 'utf8'));
    const command = capture('ps', ['-p', String(pid), '-o', 'command=']);
    if (command.includes('scripts/release/proxy.mjs')) process.kill(pid, 'SIGTERM');
  } catch { /* Already stopped. */ }
  for (const name of containers()) { assert.ok(['release-api', 'release-mail'].includes(name)); await run('docker', ['rm', '-f', name]); }
  const networks = capture('docker', ['network', 'ls', '--filter', `label=${label}`, '--format', '{{.Name}}']).split('\n').filter(Boolean);
  for (const name of networks) { assert.equal(name, 'release-test'); await run('docker', ['network', 'rm', name]); }
}

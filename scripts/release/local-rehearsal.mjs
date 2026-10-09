import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, rm, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import { resolveRehearsalDatabase } from './targets.mjs';
import { sourceState } from '../source-state.mjs';

const args = process.argv.slice(2);
assert.ok(args.every(arg => ['--api-load', '--fail-after-start'].includes(arg)), 'Use --api-load or --fail-after-start.');
const root = process.cwd();
const buildInputs = ['.dockerignore', 'package.json', 'package-lock.json', 'apps/api', 'packages/shared'];
const source = sourceState(root, [...buildInputs, 'scripts/release', 'scripts/source-state.mjs', 'scripts/images/generated-paths.mjs']);
assert.ok(!source.sourceDirty && !source.generatedDirty, 'Uncommitted build or rehearsal inputs: commit them before running the rehearsal.');
const sha = source.sourceSha;
// Archive the checked commit so edits made during the build cannot change its identity.
const buildContext = execFileSync('git', ['archive', sha, ...buildInputs, 'scripts/release'], { cwd: root, maxBuffer: 32 * 1024 * 1024 });
const id = randomBytes(6).toString('hex');
const label = `lilink.rehearsal=${id}`;
const network = `lilink-rehearsal-${id}`;
const output = path.join(root, 'artifacts/release-output', id);
const secrets = path.join(root, 'artifacts/release-secret', id);
const snapshot = path.join(root, 'artifacts/release-source', id);
const image = `lilink-rehearsal:${sha}`;
const db = `lilink_rehearsal_${id}`;
const password = randomBytes(32).toString('hex');
const key = () => randomBytes(32).toString('hex');
const env = {
  DATABASE_URL: `postgresql://rehearsal:${password}@release-db:5432/${db}`,
  REHEARSAL_RUN_ID: id, APP_ENV: 'production', NODE_ENV: 'production',
  JWT_SECRET: key(), ADMIN_JWT_SECRET: key(), MERCHANT_JWT_SECRET: key(),
  CRON_SECRET: key(), REDEEM_TICKET_SECRET: key(),
  COOKIE_NAME: 'lilink_rehearsal_token', ADMIN_COOKIE_NAME: 'lilink_rehearsal_admin_token',
  MERCHANT_COOKIE_NAME: 'lilink_rehearsal_merchant_token',
  CLIENT_ORIGIN: 'http://release-api:4000', SMTP_HOST: 'release-mail', SMTP_PORT: '1025',
  SMTP_FROM: 'LiLink Test <test@example.test>', BACKGROUND_JOBS_ENABLED: 'true',
  MAIL_DELIVERY_ENABLED: 'true', OUTBOUND_EMAIL_FLUSH_BATCH_SIZE: '500', DATABASE_CONNECTION_LIMIT: '20', SENTRY_DSN: '', SENTRY_RELEASE: sha,
};
resolveRehearsalDatabase(env.DATABASE_URL, id);
const children = new Set();
const containers = [];
const timings = {};
let cancelled = false;
let networkCreated = false;
let sampling = false;
let samples;
const started = Date.now();
const redact = text => Object.entries(env).filter(([name]) => /SECRET|DATABASE_URL/.test(name))
  .reduce((result, [, value]) => result.replaceAll(value, '[redacted]'), text).replaceAll(password, '[redacted]');
async function run(command, argv, { quiet = false, log, cleanup = false, input } = {}) {
  if (cancelled && !cleanup) throw new Error('Rehearsal cancelled.');
  const child = spawn(command, argv, { cwd: root, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
  let inputError;
  if (input) {
    child.stdin.on('error', error => { inputError = error; });
    child.stdin.end(input);
  }
  children.add(child);
  let data = '';
  child.stdout.on('data', chunk => { data += chunk; });
  child.stderr.on('data', chunk => { data += chunk; });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject); child.once('exit', resolve);
  }).finally(() => children.delete(child));
  data = redact(data);
  if (log) await writeFile(path.join(output, log), data);
  if (!quiet) process.stdout.write(data);
  if (code !== 0) throw new Error(`${command} exited ${code}; ${log ?? 'see rehearsal evidence'}`);
  if (inputError) throw inputError;
  return data.trim();
}
const docker = (argv, options) => run('docker', argv, options);
const mounted = ['--network', network, '-v', `${secrets}/api_env:/run/secrets/api_env:ro`,
  '-v', `${snapshot}/scripts/release:/release:ro`];
async function container(alias, argv) {
  const name = `${network}-${alias}`;
  containers.push(name);
  await docker(['run', '-d', '--name', name, '--label', label, '--network', network,
    '--network-alias', alias, ...argv], { quiet: true });
  return name;
}
async function stage(name, action) {
  const start = Date.now();
  try { return await action(); } finally { timings[name] = Date.now() - start; }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  cancelled = true;
  for (const child of children) {
    child.kill('SIGTERM');
    setTimeout(() => { if (children.has(child)) child.kill('SIGKILL'); }, 3000).unref();
  }
});
await mkdir(output, { recursive: true });
await mkdir(secrets, { recursive: true, mode: 0o700 });
// Only the individual file is mounted; UID 1001 can read it, host directory stays private.
await writeFile(`${secrets}/api_env`, Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n'), { mode: 0o644 });
await writeFile(`${secrets}/postgres`, `POSTGRES_DB=${db}\nPOSTGRES_USER=rehearsal\nPOSTGRES_PASSWORD=${password}\n`, { mode: 0o600 });
let api;
try {
  await mkdir(snapshot, { recursive: true });
  await run('tar', ['-x', '-C', snapshot], { quiet: true, input: buildContext });
  await stage('build', () => docker(['build', '-f', 'apps/api/Dockerfile.prod', '--build-arg', `SENTRY_RELEASE=${sha}`, '-t', image, '-'], { log: 'build.log', input: buildContext }));
  await docker(['network', 'create', '--internal', '--label', label, network], { quiet: true });
  networkCreated = true;
  const postgres = await container('release-db', ['--env-file', `${secrets}/postgres`, '--tmpfs', '/var/lib/postgresql/data:rw', 'postgres:17-alpine']);
  await container('release-mail', ['ghcr.io/axllent/mailpit:v1.20', '--max', '20000']);
  for (let attempt = 0; ; attempt++) {
    try { await docker(['exec', postgres, 'pg_isready', '-U', 'rehearsal', '-d', db], { quiet: true }); break; }
    catch (error) { if (attempt === 30 || cancelled) throw error; await new Promise(r => setTimeout(r, 500)); }
  }
  assert.equal(await docker(['inspect', '--format', '{{index .Config.Labels "lilink.rehearsal"}}', postgres], { quiet: true }), id);
  const identity = await docker(['exec', postgres, 'psql', '-U', 'rehearsal', '-d', db, '-Atc', "SELECT current_database() || ':' || current_user || ':' || (SELECT count(*) FROM pg_tables WHERE schemaname='public')"], { quiet: true });
  assert.equal(identity, `${db}:rehearsal:0`, 'Migration requires this task-owned empty database.');
  api = await stage('start', () => container('release-api', [...mounted.slice(2), '--cpus=2', '--memory=3584m', image]));
  const work = async (script, log) => {
    const name = `${network}-load`;
    containers.push(name);
    await docker(['run', '--rm', '--name', name, '--label', label, ...mounted, image,
      'node', 'scripts/production-entrypoint.mjs', 'node', `/release/${script}`], { log });
  };
  await stage('migrationAndReadiness', async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        await docker(['exec', api, 'node', '-e', "fetch('http://127.0.0.1:4000/v1/health',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"], { quiet: true });
        break;
      } catch (error) { if (attempt === 90 || cancelled) throw error; await new Promise(r => setTimeout(r, 1000)); }
    }
  });
  if (args.includes('--fail-after-start')) throw new Error('Controlled failure after production startup.');
  await stage('seed', () => work('seed-load.mjs', 'seed.log'));
  sampling = true;
  samples = (async () => {
    const observations = [];
    while (sampling && !cancelled) {
      const resources = await docker(['stats', '--no-stream', '--format', '{{json .}}', api, postgres], { quiet: true });
      const connections = await docker(['exec', postgres, 'psql', '-U', 'rehearsal', '-d', db, '-Atc', 'SELECT state, count(*) FROM pg_stat_activity WHERE datname=current_database() GROUP BY state'], { quiet: true });
      observations.push({ time: new Date().toISOString(), resources: resources.split('\n').map(JSON.parse), connections });
      await writeFile(`${output}/resources.json`, JSON.stringify(observations, null, 2));
    }
  })();
  samples.catch(() => {});
  await stage('matching', () => work('matching-rehearsal.mjs', 'matching.jsonl'));
  if (args.includes('--api-load')) {
    await writeFile(`${secrets}/jwt`, env.JWT_SECRET, { mode: 0o644 });
    const name = `${network}-k6`; containers.push(name);
    await stage('apiLoad', () => docker(['run', '--rm', '--name', name, '--label', label, '--network', network,
      '--user', `${process.getuid?.() ?? 0}`, '-v', `${snapshot}/scripts/release:/release:ro`,
      '-v', `${secrets}/jwt:/jwt:ro`, '-v', `${snapshot}/apps/api/prisma/fixtures/autumn-20260920-questionnaire.json:/questions.json:ro`,
      '-v', `${output}:/output`, '-e', 'ACCESS_FILE=/jwt', '-e', 'QUESTION_FIXTURE=/questions.json',
      '-e', `RELEASE_SHA=${sha}`, '-e', 'SUMMARY_FILE=/output/k6.json', '-e', 'MODE=mixed',
      'grafana/k6:1.6.1', 'run', '/release/load.js'], { log: 'k6.log' }));
  }
} catch (error) {
  process.exitCode = cancelled ? 130 : 1;
  console.error(redact(error.message));
} finally {
  sampling = false;
  await samples?.catch(error => { console.error(redact(error.message)); process.exitCode ||= 1; });
  if (api) await docker(['logs', api], { quiet: true, log: 'api.log', cleanup: true }).catch(() => { process.exitCode ||= 1; });
  await stage('cleanup', async () => {
    for (const name of [...new Set(containers)].reverse()) {
      await docker(['rm', '-fv', name], { quiet: true, cleanup: true }).catch(async () => {
        const remaining = await docker(['ps', '-aq', '--filter', `name=^${name}$`], { quiet: true, cleanup: true });
        if (remaining) process.exitCode ||= 1;
      });
    }
    if (networkCreated) await docker(['network', 'rm', network], { quiet: true, cleanup: true }).catch(() => { process.exitCode ||= 1; });
    await rm(secrets, { recursive: true, force: true });
    await rm(snapshot, { recursive: true, force: true });
  });
  const remaining = await docker(['ps', '-aq', '--filter', `label=${label}`], { quiet: true, cleanup: true });
  const remainingNetworks = await docker(['network', 'ls', '-q', '--filter', `label=${label}`], { quiet: true, cleanup: true });
  const secretsRemain = await access(secrets).then(() => true, () => false);
  const snapshotRemains = await access(snapshot).then(() => true, () => false);
  const cleanupPassed = !remaining && !remainingNetworks && !secretsRemain && !snapshotRemains;
  if (!cleanupPassed) process.exitCode ||= 1;
  await writeFile(`${output}/run.json`, JSON.stringify({ sha, id, arguments: args, platform: process.platform, architecture: process.arch,
    timingsMs: timings, durationMs: Date.now() - started, exitCode: process.exitCode ?? 0, cleanupPassed }, null, 2));
  console.log(`Rehearsal evidence: ${output}`);
}

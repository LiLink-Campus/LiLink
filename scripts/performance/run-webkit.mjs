import { mkdir, writeFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTestDatabase } from '../e2e/environment.mjs';
import { browserEnvironment } from './options.mjs';
import { readDisposableSession } from './local-session.mjs';

const [sessionPath, outputPath] = process.argv.slice(2);
if (!sessionPath || !outputPath) throw new Error('Usage: node scripts/performance/run-webkit.mjs <runner-session.json> <output-directory>');
const session = await readDisposableSession(sessionPath);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.resolve(outputPath);
const workspace = path.join(root, 'artifacts/e2e', session.runId, 'workspace');
const run = promisify(execFile);
const dbContainer = `lilink-e2e-db-${session.runId}`;
const label = (await run('docker', ['inspect', '--format', '{{ index .Config.Labels "lilink.e2e" }}', dbContainer])).stdout.trim();
if (label !== session.runId) throw new Error('Disposable database label does not match this session.');
const mapping = (await run('docker', ['port', dbContainer, '5432/tcp'])).stdout.trim().match(/^127\.0\.0\.1:(\d+)$/);
if (!mapping) throw new Error('Disposable database is not published on one loopback port.');
const databaseUrl = `postgresql://e2e:e2e@127.0.0.1:${mapping[1]}/lilink_e2e_${session.runId}`;
assertTestDatabase(databaseUrl);
const { env: inherited } = browserEnvironment();
const env = {};
for (const key of ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'SystemRoot', 'PLAYWRIGHT_BROWSERS_PATH']) {
  if (inherited[key]) env[key] = inherited[key];
}
Object.assign(env, { NODE_ENV: 'test', APP_ENV: 'test', DATABASE_URL: databaseUrl,
  E2E_WORKSPACE: workspace, E2E_SOURCE_ROOT: root, E2E_OUTPUT: output,
  E2E_WEB_URL: session.webUrl, E2E_API_URL: session.apiUrl, E2E_CDN_URL: session.cdnUrl ?? '', E2E_MAIL_URL: session.mailUrl,
  SENTRY_DSN: '', NEXT_PUBLIC_SENTRY_DSN: '' });
await mkdir(output, { recursive: true });
const args = [path.join(root, 'node_modules/@playwright/test/cli.js'), 'test',
  'e2e/specs/loading-performance.spec.ts', '--project=webkit', '--project=mobile-webkit', '--workers=1'];
await writeFile(path.join(output, 'environment.json'), JSON.stringify({
  runId: session.runId, reusedDisposableServices: true, webUrl: session.webUrl, cdnUrl: session.cdnUrl,
  projects: ['webkit', 'mobile-webkit'], testFile: 'e2e/specs/loading-performance.spec.ts',
  note: 'Real isolated WebKit engine functional loading/fault checks, not a quantitative Safari field-performance comparison.',
}, null, 2));
const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
const code = await new Promise((resolve, reject) => {
  child.once('error', reject); child.once('exit', value => resolve(value ?? 1));
});
process.exitCode = code;

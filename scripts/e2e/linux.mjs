import { spawn } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const id = randomBytes(6).toString('hex');
const stage = path.join(root, 'artifacts/e2e-linux', id);
const output = path.join(root, 'artifacts/e2e-linux-results');
const baseline = path.join(root, 'e2e/baselines');
const name = `lilink-e2e-linux-${id}`;
let runnerStarted = false;
let stageCleanup;
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Docker exited ${code}`)));
  });
}
function cleanupStage() {
  stageCleanup ??= (async () => {
    // Bind-mounted files created by container root need host ownership on Linux.
    if (runnerStarted && process.platform === 'linux') {
      await run(['run', '--rm', '-v', `${stage}:/work`, '--entrypoint', 'chown',
        'lilink-e2e-runner:1.60.0', '-R', `${process.getuid()}:${process.getgid()}`, '/work']);
    }
    await rm(stage, { recursive: true, force: true });
  })();
  return stageCleanup;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  void run(['stop', '--time', '15', name]).catch(() => {}).finally(async () => {
    await cleanupStage();
    process.exit(130);
  });
});

// Docker's host network places nested services and the runner on one loopback.
// The source copy excludes local configuration and host-specific dependencies.
try {
  await mkdir(stage, { recursive: true });
  await mkdir(output, { recursive: true });
  await mkdir(baseline, { recursive: true });
  const excluded = new Set(['node_modules', '.next', 'dist', 'generated', 'coverage', 'storybook-static']);
  for (const entry of ['package.json', 'package-lock.json', 'apps', 'packages', 'scripts', 'e2e', 'playwright.config.ts']) {
    await cp(path.join(root, entry), path.join(stage, entry), { recursive: true,
      filter: source => !excluded.has(path.basename(source)) && !path.basename(source).startsWith('.env') && !source.endsWith('.tsbuildinfo'),
    });
  }
  await run(['build', '-t', 'lilink-e2e-runner:1.60.0', '-f', path.join(root, 'scripts/e2e/Dockerfile'), path.join(root, 'scripts/e2e')]);
  const socket = '/var/run/docker.sock';
  runnerStarted = true;
  await run(['run', '--rm', '--name', name, '--network', 'host', '--ipc', 'host',
    '-v', `${socket}:/var/run/docker.sock`, '-v', `${stage}:/work`, '-v', '/work/node_modules',
    '-v', `${output}:/work/artifacts/e2e`, '-v', `${baseline}:/work/e2e/baselines`,
    'lilink-e2e-runner:1.60.0', 'npm ci --no-audit --no-fund && exec node scripts/e2e/run.mjs "$@"', 'e2e', ...process.argv.slice(2)]);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally { await cleanupStage(); }

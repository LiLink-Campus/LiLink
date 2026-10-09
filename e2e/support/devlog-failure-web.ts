import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';

// A distinct upstream URL bypasses the one-hour fetch cache without changing
// production caching or rebuilding Next. The real upstream responds with 503.
export async function startDevlogFailureWeb(logPath: string) {
  const workspace = process.env.E2E_WORKSPACE!;
  const reserve = net.createServer();
  await new Promise<void>((resolve, reject) => {
    reserve.once('error', reject); reserve.listen(0, '127.0.0.1', resolve);
  });
  const port = (reserve.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => reserve.close(() => resolve()));
  const require = createRequire(path.join(workspace, 'apps/web/package.json'));
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: path.join(workspace, 'apps/web'), env: { ...process.env,
      DEVLOG_BASE_URL: `${process.env.E2E_DEVLOG_FIXTURE_URL}/failure` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = createWriteStream(logPath);
  child.stdout.pipe(log); child.stderr.pipe(log);
  const done = new Promise<void>((resolve, reject) => { child.once('error', reject); child.once('exit', () => resolve()); });
  done.catch(() => {});
  const stop = async () => {
    child.kill('SIGTERM');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([done, new Promise<void>(resolve => { timer = setTimeout(resolve, 3000); })]); }
    finally { clearTimeout(timer); }
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await done; }
    log.end();
  };
  const url = `http://127.0.0.1:${port}`;
  try {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('Fallback Web exited before readiness.');
      try { if ((await fetch(`${url}/login`, { signal: AbortSignal.timeout(1000) })).ok) return { url, stop }; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Fallback Web readiness timed out.');
  } catch (error) { await stop(); throw error; }
}

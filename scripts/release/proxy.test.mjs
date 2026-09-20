import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import http from 'node:http';

test('invalid multibyte credentials return 403 without crashing the rehearsal proxy', { timeout: 10_000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lilink-release-proxy-'));
  const key = 'isolated-proxy-test-key-0123456789';
  const access = path.join(dir, 'key');
  await writeFile(access, key, { mode: 0o600 });
  const child = fork(new URL('./proxy.mjs', import.meta.url), [], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: { ...process.env, RELEASE_ACCESS_FILE: access, RELEASE_PROXY_PORT: '0', GITHUB_SHA: 'proxy-test' },
  });
  try {
    const [{ port }] = await once(child, 'message');
    const request = supplied => new Promise((resolve, reject) => {
      const req = http.get({ hostname: '127.0.0.1', port, path: '/__release', headers: { 'x-release-access': supplied } }, response => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      });
      req.on('error', reject);
    });
    assert.equal(await request('é'.repeat(key.length)), 403);
    assert.equal(await request(key), 200);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    await rm(dir, { recursive: true });
  }
});

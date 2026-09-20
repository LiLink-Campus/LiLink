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

test('only the isolated web origin can preflight; actual requests remain authenticated', { timeout: 10_000 }, async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'lilink-release-cors-'));
  const key = 'isolated-proxy-test-key-0123456789';
  const access = path.join(dir, 'key');
  await writeFile(access, key, { mode: 0o600 });
  let forwarded = 0;
  const upstream = http.createServer((request, response) => {
    forwarded++;
    response.writeHead(request.method === 'OPTIONS' ? 204 : 200, {
      'access-control-allow-origin': 'https://release-20260920.lilink.top',
      'access-control-allow-credentials': 'true',
    });
    response.end();
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const child = fork(new URL('./proxy.mjs', import.meta.url), [], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: { ...process.env, RELEASE_ACCESS_FILE: access, RELEASE_PROXY_PORT: '0', RELEASE_API_PORT: String(upstream.address().port), GITHUB_SHA: 'proxy-test' },
  });
  try {
    const [{ port }] = await once(child, 'message');
    const call = (method, path, headers) => fetch(`http://127.0.0.1:${port}${path}`, { method, headers });
    assert.equal((await call('GET', '/', {})).status, 200);
    assert.equal((await call('GET', '/__release', {})).status, 403);
    const preflight = { origin: 'https://release-20260920.lilink.top', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' };
    const allowed = await call('OPTIONS', '/v1/auth/login', preflight);
    assert.equal(allowed.status, 204);
    assert.equal(allowed.headers.get('access-control-allow-origin'), preflight.origin);
    assert.equal((await call('OPTIONS', '/v1/auth/login', { ...preflight, origin: 'https://untrusted.example' })).status, 403);
    assert.equal((await call('OPTIONS', '/__evidence', preflight)).status, 403);
    assert.equal((await call('POST', '/v1/auth/login', { origin: preflight.origin })).status, 403);
    assert.equal(forwarded, 1);
    assert.equal((await call('POST', '/v1/auth/login', { origin: preflight.origin, cookie: `lilink_release_access=${key}` })).status, 200);
    assert.equal(forwarded, 2);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
    await rm(dir, { recursive: true });
  }
});

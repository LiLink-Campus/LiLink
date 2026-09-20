import { loadTargets, resolveLoadTarget } from './targets.mjs';
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const secret = (await readFile(process.env.RELEASE_ACCESS_FILE, 'utf8')).trim();
const target = process.env.RELEASE_TARGET_FILE ? resolveLoadTarget(JSON.parse(await readFile(process.env.RELEASE_TARGET_FILE, 'utf8'))) : loadTargets[0];
const identity = { release: process.env.GITHUB_SHA, ...target, host: target.directHost, users: 2000, synthetic: true };
const command = promisify(execFile);
const upstreamPort = Number(process.env.RELEASE_API_PORT ?? 4000);
if (!Number.isInteger(upstreamPort) || upstreamPort < 1024 || upstreamPort > 65535) throw new Error('Invalid loopback rehearsal port.');
const proxyPort = Number(process.env.RELEASE_PROXY_PORT ?? 4080);
if (!Number.isInteger(proxyPort) || (proxyPort !== 0 && proxyPort < 1024) || proxyPort > 65535) throw new Error('Invalid loopback proxy port.');
const server = http.createServer((request, response) => {
  const preflight = request.method === 'OPTIONS' && request.url.startsWith('/v1/') && request.headers.origin === 'https://release-20260920.lilink.top' && ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(request.headers['access-control-request-method']);
  const supplied = request.headers['x-release-access'] ?? request.headers.cookie?.match(/(?:^|;\s*)lilink_release_access=([^;]+)/)?.[1] ?? '';
  // Browsers omit cookies on CORS preflight; the actual request still needs access.
  if (!preflight && (typeof supplied !== 'string' || Buffer.byteLength(supplied) !== Buffer.byteLength(secret) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret)))) { response.writeHead(403); response.end('Isolated rehearsal'); return; }
  if (request.url === '/__release') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(identity)); return; }
  if (request.url === '/__evidence') {
    void Promise.all([command('docker', ['logs', '--tail', '150', 'release-api']), command('docker', ['stats', '--no-stream', '--format', '{{json .}}', 'release-api'])]).then(([logs, stats]) => {
      response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ identity, logs: logs.stdout + logs.stderr, resources: stats.stdout }));
    }).catch(() => { response.writeHead(500); response.end('Evidence unavailable'); });
    return;
  }
  if (request.url === '/__stop' && request.method === 'POST') { void writeFile('artifacts/release-stop', 'done'); response.end('stopping'); return; }
  const started = performance.now();
  const startedAt = new Date().toISOString();
  const upstream = http.request({ hostname: '127.0.0.1', port: upstreamPort, method: request.method, path: request.url, headers: request.headers }, res => {
    response.writeHead(res.statusCode, res.headers); res.pipe(response);
    res.on('end', () => console.log(JSON.stringify({ startedAt, path: request.url.split('?')[0], method: request.method, status: res.statusCode, ms: Math.round(performance.now() - started) })));
  });
  upstream.on('error', () => { response.writeHead(502); response.end('Upstream unavailable'); });
  request.pipe(upstream);
});
server.listen(proxyPort, '127.0.0.1', () => process.send?.({ port: server.address().port }));

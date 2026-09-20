import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const secret = (await readFile(process.env.RELEASE_ACCESS_FILE, 'utf8')).trim();
const identity = { release: process.env.GITHUB_SHA, branchId: 'br-muddy-poetry-azax6deb', projectId: 'patient-meadow-65557384', host: 'ep-crimson-thunder-aztzdzla.c-3.ap-southeast-1.aws.neon.tech', users: 2000, synthetic: true };
const server = http.createServer((request, response) => {
  const supplied = request.headers['x-release-access'] ?? request.headers.cookie?.match(/(?:^|;\s*)lilink_release_access=([^;]+)/)?.[1] ?? '';
  if (typeof supplied !== 'string' || supplied.length !== secret.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(secret))) { response.writeHead(403); response.end('Isolated rehearsal'); return; }
  if (request.url === '/__release') { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(identity)); return; }
  if (request.url === '/__stop' && request.method === 'POST') { void writeFile('artifacts/release-stop', 'done'); response.end('stopping'); return; }
  const started = performance.now();
  const upstream = http.request({ hostname: '127.0.0.1', port: 4000, method: request.method, path: request.url, headers: request.headers }, res => {
    response.writeHead(res.statusCode, res.headers); res.pipe(response);
    res.on('end', () => console.log(JSON.stringify({ path: request.url.split('?')[0], method: request.method, status: res.statusCode, ms: Math.round(performance.now() - started) })));
  });
  upstream.on('error', () => { response.writeHead(502); response.end('Upstream unavailable'); });
  request.pipe(upstream);
});
server.listen(4080, '127.0.0.1');

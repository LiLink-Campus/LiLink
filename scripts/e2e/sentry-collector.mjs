import { createServer } from 'node:http';
import { appendFile } from 'node:fs/promises';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';

// Store only synthetic telemetry outcomes, never raw envelopes or Replay content.
const [portArgument, webOrigin, output] = process.argv.slice(2);
const port = Number(portArgument);
const origin = new URL(webOrigin);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || origin.protocol !== 'http:' ||
    origin.hostname !== '127.0.0.1' || !origin.port || origin.origin !== webOrigin || !output) {
  throw new Error('Sentry collector requires a disposable loopback port and web origin.');
}
const summaries = [];
const MAX_ENVELOPE_BYTES = 10 * 1024 * 1024;
const decompress = promisify(gunzip);

function summarizeEnvelope(body) {
  let cursor = body.indexOf(10) + 1;
  if (cursor <= 0) return [];
  const items = [];
  while (cursor < body.length) {
    const headerEnd = body.indexOf(10, cursor);
    if (headerEnd < 0) break;
    const header = JSON.parse(body.subarray(cursor, headerEnd).toString());
    const payloadStart = headerEnd + 1;
    const payloadEnd = Number.isInteger(header.length) && header.length >= 0
      ? payloadStart + header.length : (body.indexOf(10, payloadStart) < 0 ? body.length : body.indexOf(10, payloadStart));
    if (payloadEnd > body.length) throw new Error('Truncated envelope item.');
    let event = {};
    if (['event', 'transaction', 'replay_event', 'span'].includes(header.type)) {
      event = JSON.parse(body.subarray(payloadStart, payloadEnd).toString());
    }
    const trace = event.contexts?.trace ?? {};
    items.push({ type: header.type, traceId: trace.trace_id, parentSpanId: trace.parent_span_id,
      op: trace.op, transaction: event.transaction,
      syntheticError: event.exception?.values?.some(value => value.value === 'LiLink synthetic Sentry cache trace probe') || undefined });
    cursor = payloadEnd + (body[payloadEnd] === 10 ? 1 : 0);
  }
  return items;
}

const server = createServer(async (request, response) => {
  const requestOrigin = request.headers.origin;
  if (requestOrigin && requestOrigin !== webOrigin) { response.writeHead(403).end(); return; }
  response.setHeader('Access-Control-Allow-Origin', webOrigin);
  response.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'content-type, sentry-trace, baggage, cf-connecting-ip');
  if (request.method === 'OPTIONS') { response.writeHead(204).end(); return; }
  const pathname = new URL(request.url, `http://127.0.0.1:${port}`).pathname;
  if (request.method === 'GET' && ['/events', '/health'].includes(pathname)) {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(pathname === '/events' ? summaries : { ok: true })); return;
  }
  if (request.method !== 'POST' || pathname !== '/api/1/envelope/') { response.writeHead(404).end(); return; }
  const chunks = [];
  let bytes = 0;
  try {
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > MAX_ENVELOPE_BYTES) { response.writeHead(413).end(); return; }
      chunks.push(chunk);
    }
    const compressed = Buffer.concat(chunks);
    const body = request.headers['content-encoding'] === 'gzip'
      ? await decompress(compressed, { maxOutputLength: MAX_ENVELOPE_BYTES }) : compressed;
    const items = summarizeEnvelope(body);
    summaries.push(...items);
    if (summaries.length > 10_000) summaries.splice(0, summaries.length - 10_000);
    await appendFile(output, items.map(item => JSON.stringify(item)).join('\n') + '\n');
    response.setHeader('Content-Type', 'application/json');
    response.end('{}');
  } catch {
    response.writeHead(400).end();
  }
});
server.listen(port, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => process.exit(0)));

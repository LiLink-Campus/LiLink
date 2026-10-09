import http from 'node:http';

// This loopback-only harness mutates real upstream JSON for selected synthetic sessions.
export async function startContractProxy(port, apiUrl) {
  const rules = new Map();
  const upstream = new URL(apiUrl).origin;
  const shutdown = new AbortController();
  const server = http.createServer(async (request, response) => {
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      if (request.url === '/__e2e_contract') {
        if (request.method === 'POST') {
          const rule = JSON.parse(body.toString());
          if (typeof rule.cookie !== 'string' || typeof rule.path !== 'string' || !['invalid', 'compatible', 'vip-null', 'off'].includes(rule.mode)) {
            response.writeHead(400).end(); return;
          }
          rules.set(`${rule.cookie}:${rule.path}`, { mode: rule.mode, hits: 0 });
          response.writeHead(204).end(); return;
        }
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ hits: [...rules.values()].reduce((sum, rule) => sum + rule.hits, 0) }));
        return;
      }
      const headers = { ...request.headers };
      delete headers.host;
      const result = await fetch(`${upstream}${request.url}`, {
        method: request.method, headers, body: body.length ? body : undefined,
        signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(15_000)]),
      });
      let output = await result.text();
      const rule = rules.get(`${request.headers.cookie}:${request.url}`);
      if (result.ok && rule && rule.mode !== 'off') {
        const payload = JSON.parse(output);
        if (rule.mode === 'invalid') payload.user = { id: 42 };
        else if (rule.mode === 'vip-null') payload.vip = null;
        else {
          payload.futureContractField = { permitted: true };
          if (payload.savedQuestionnaire) delete payload.savedQuestionnaire.vipFiltersActive;
        }
        output = JSON.stringify(payload);
        rule.hits += 1;
      }
      for (const [key, value] of result.headers) {
        if (!['content-length', 'content-encoding', 'connection', 'transfer-encoding'].includes(key)) response.setHeader(key, value);
      }
      response.writeHead(result.status).end(output);
    } catch {
      response.writeHead(502).end('Synthetic contract proxy failure');
    }
  });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  return { close: () => new Promise(resolve => {
    shutdown.abort();
    server.close(resolve);
    server.closeAllConnections();
  }) };
}

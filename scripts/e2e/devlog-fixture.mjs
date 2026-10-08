import http from 'node:http';

export async function startDevlogFixture(mode) {
  if (!['items', 'empty', 'failure', 'malformed'].includes(mode)) throw new Error('Unknown devlog fixture mode.');
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    response.setHeader('Cache-Control', 'no-store');
    if (pathname === '/failure/updates.json') { response.writeHead(503).end('{}'); return; }
    if (pathname === '/updates.json') {
      response.setHeader('Content-Type', 'application/json');
      if (mode === 'failure') { response.writeHead(503); response.end('{}'); return; }
      if (mode === 'malformed') { response.end('{invalid'); return; }
      const base = `http://127.0.0.1:${server.address().port}`;
      const items = mode === 'empty' ? [] : Array.from({ length: 14 }, (_, index) => ({
        title: `合成产品更新 ${14 - index}`, summary: '用于验收的公开合成更新内容。',
        publishedAt: `2026-10-${String(14 - index).padStart(2, '0')}`,
        url: `${base}/posts/${14 - index}`, tags: ['产品'],
      }));
      response.end(JSON.stringify({ generatedAt: '2026-10-14T00:00:00.000Z',
        latestPublishedAt: items[0]?.publishedAt ?? null, totalPublished: items.length, items }));
      return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(`<main><h1>合成文章 ${pathname.split('/').at(-1)}</h1><p>已打开完整产品更新。</p></main>`);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }) };
}

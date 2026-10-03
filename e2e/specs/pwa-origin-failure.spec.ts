import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { test, expect } from '../support/fixtures';

test.use({ serviceWorkers: 'allow' });

// Failure boundaries: precaching omits credentials; a failed replacement leaves
// the active worker usable; unrelated caches cannot shadow offline resources;
// losing the HTTP origin serves complete cached assets.
test('PWA survives failed precaching and an unreachable same-origin server @smoke', async ({ page, context, browser }, info) => {
  const publicRoot = path.join(process.env.E2E_WORKSPACE!, 'apps/web/public');
  const offlineDocument = await readFile(path.join(publicRoot, 'offline.html'), 'utf8');
  const iconPath = offlineDocument.match(/src="(\/icons\/icon\.[a-f0-9]{12}\.svg)"/)?.[1];
  if (!iconPath) throw new Error('Missing versioned offline icon.');
  const precacheRequests: { path: string; credentialsPresent: boolean }[] = [];
  let rejectIcons = false;
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url!, 'http://127.0.0.1').pathname;
    if (pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<!doctype html><html><title>Isolated PWA origin</title><body>Ready for worker installation</body></html>');
      return;
    }
    const contentTypes: Record<string, string> = {
      '/sw.js': 'text/javascript', '/offline.html': 'text/html; charset=utf-8',
    };
    if (/^\/icons\/icon(?:-maskable)?\.[a-f0-9]{12}\.svg$/.test(pathname)) contentTypes[pathname] = 'image/svg+xml';
    if (!contentTypes[pathname]) { response.writeHead(404).end(); return; }
    if (pathname !== '/sw.js') precacheRequests.push({ path: pathname, credentialsPresent: Boolean(request.headers.cookie) });
    if (rejectIcons && pathname.startsWith('/icons/')) { response.writeHead(503).end(); return; }
    try {
      const body = await readFile(path.join(publicRoot, pathname));
      response.writeHead(200, { 'Content-Type': contentTypes[pathname], 'Cache-Control': 'no-store' }).end(body);
    } catch { response.writeHead(500).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing disposable origin port.');
  const origin = `http://127.0.0.1:${address.port}`;
  const close = async () => {
    if (!server.listening) return;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  };
  try {
    await context.addCookies([{ name: 'pwa-acceptance', value: 'synthetic', url: origin }]);
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.evaluate(async (icon) => {
      const unrelated = await caches.open('unrelated-acceptance-cache');
      await unrelated.put('/offline.html', new Response('<h1>Unrelated cached document</h1>', {
        headers: { 'Content-Type': 'text/html' },
      }));
      await unrelated.put(icon, new Response('Unrelated cached image', {
        headers: { 'Content-Type': 'image/svg+xml' },
      }));
    }, iconPath);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    expect(precacheRequests).toHaveLength(3);
    expect(precacheRequests.some(request => request.path === '/offline.html')).toBe(true);
    expect(precacheRequests.filter(request => /^\/icons\/icon(?:-maskable)?\.[a-f0-9]{12}\.svg$/.test(request.path))).toHaveLength(2);
    expect(precacheRequests.every(request => !request.credentialsPresent)).toBe(true);
    rejectIcons = true;
    const replacementState = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/sw.js?acceptance=failed');
      const worker = registration.installing;
      if (!worker) throw new Error('Replacement worker did not enter installation.');
      const state = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Replacement worker did not settle.')), 10_000);
        const settled = () => {
          if (worker.state === 'redundant' || worker.state === 'activated') {
            clearTimeout(timeout);
            worker.removeEventListener('statechange', settled);
            resolve(worker.state);
          }
        };
        worker.addEventListener('statechange', settled);
        settled();
      });
      return { state, activePath: new URL(registration.active!.scriptURL).pathname,
        activeQuery: new URL(registration.active!.scriptURL).search };
    });
    expect(replacementState).toEqual({ state: 'redundant', activePath: '/sw.js', activeQuery: '' });
    await close();
    await page.goto(`${origin}/origin-is-down`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '当前处于离线状态' })).toBeVisible();
    await expect.poll(async () => page.getByRole('img', { name: 'LiLink 飞鸟衔信标志' })
      .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    const unrelatedDocument = await page.evaluate(async () => {
      const unrelated = await caches.open('unrelated-acceptance-cache');
      return (await unrelated.match('/offline.html'))?.text();
    });
    expect(unrelatedDocument).toContain('Unrelated cached document');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('origin-unreachable-offline.png'), fullPage: true });
    await info.attach('pwa-origin-unreachable', { contentType: 'application/json', body: JSON.stringify({
      project: info.project.name, browser: browser.version(), viewport: page.viewportSize(),
      fault: 'Unrelated caches contain the same paths; the origin rejected replacement precaching, then closed its HTTP listener.',
      assertions: { realPublishedWorkerInstalled: true, sameOriginPrecacheOmittedCredentials: true,
        failedReplacementKeptActiveWorker: true, httpOriginClosed: true,
        offlineDocumentVisible: true, cachedSameOriginIconDecoded: true,
        unrelatedCachePreservedWithoutShadowingOfflineResources: true },
    }, null, 2) });
  } finally { await close(); }
});

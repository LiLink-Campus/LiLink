import { test, expect, visit } from '../support/fixtures';

test.use({ serviceWorkers: 'allow' });
const iconPath = /^\/icons\/icon(?:-maskable)?\.[a-f0-9]{12}\.svg$/;

// Failure boundaries: the published worker and readable cached offline resources
// must use the Web origin without any external static host configuration.
test('PWA installs readable same-origin offline assets @smoke', async ({ page, context, browser }, info) => {
  const iconRequests: { path: string; sameOrigin: boolean; worker: boolean }[] = [];
  context.on('request', request => {
    const url = new URL(request.url());
    if (iconPath.test(url.pathname)) iconRequests.push({ path: url.pathname,
      sameOrigin: url.origin === process.env.E2E_WEB_URL, worker: Boolean(request.serviceWorker()) });
  });
  await visit(page, '/');
  await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.getRegistration())?.active && navigator.serviceWorker.controller));
  const installed = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const keys = await caches.keys();
    const name = keys.find(key => key.startsWith('lilink-pwa-'))!;
    const cache = await caches.open(name);
    const paths = (await cache.keys()).map(request => new URL(request.url).pathname).sort();
    const icon = await cache.match(paths.find(path => /^\/icons\/icon\.[a-f0-9]{12}\.svg$/.test(path))!);
    const maskable = await cache.match(paths.find(path => /^\/icons\/icon-maskable\.[a-f0-9]{12}\.svg$/.test(path))!);
    return { scriptUrl: registration.active!.scriptURL, scope: registration.scope,
      cacheName: name, paths,
      cacheOrigins: [...new Set((await cache.keys()).map(request => new URL(request.url).origin))],
      iconsReadable: Boolean(icon?.ok && maskable?.ok && (await icon.text()).includes('<svg')
        && (await maskable.text()).includes('<svg')) };
  });
  expect(new URL(installed.scriptUrl).pathname).toBe('/sw.js');
  expect(new URL(installed.scriptUrl).search).toBe('');
  expect(new URL(installed.scriptUrl).origin).toBe(process.env.E2E_WEB_URL);
  expect(new URL(installed.scope).origin).toBe(process.env.E2E_WEB_URL);
  expect(installed.paths).toHaveLength(3);
  expect(installed.paths).toContain('/offline.html');
  expect(installed.paths.filter(path => iconPath.test(path))).toHaveLength(2);
  expect(installed.cacheOrigins).toEqual([process.env.E2E_WEB_URL]);
  expect(installed.iconsReadable).toBe(true);
  expect(iconRequests.every(request => request.sameOrigin)).toBe(true);
  await info.attach('pwa-install', { contentType: 'application/json', body: JSON.stringify({
    project: info.project.name, browser: browser.version(), viewport: page.viewportSize(),
    cacheName: installed.cacheName, paths: installed.paths, iconRequests,
    assertions: { actualServiceWorkerActivated: true, sameOriginWorkerAndCache: true, bothCachedIconsReadable: true },
  }, null, 2) });
});

// Failure boundaries: a worker update must activate the new URL, remove only its
// obsolete cache, and retain usable offline HTML and icons plus unrelated caches.
test('PWA worker update preserves offline assets and unrelated caches @smoke', async ({ page, browser }, info) => {
  await visit(page, '/offline.html');
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js?acceptance=prior');
    await navigator.serviceWorker.ready;
    await (await caches.open('lilink-pwa-obsolete-acceptance')).put('/old-pwa-entry', new Response('old'));
    await (await caches.open('unrelated-acceptance-cache')).put('/other-entry', new Response('preserve'));
  });
  await visit(page, '/');
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return registration?.active && !new URL(registration.active.scriptURL).searchParams.has('acceptance')
      && navigator.serviceWorker.controller && !(await caches.keys()).includes('lilink-pwa-obsolete-acceptance');
  });
  const evidence = await page.evaluate(async () => {
    const names = await caches.keys();
    const currentName = names.find(name => name.startsWith('lilink-pwa-'))!;
    const current = await caches.open(currentName);
    const iconPath = (await current.keys()).find(request => /^\/icons\/icon\.[a-f0-9]{12}\.svg$/.test(new URL(request.url).pathname))!;
    const icon = await current.match(iconPath);
    const offline = await caches.match('/offline.html');
    return { names, iconReadable: Boolean(icon?.ok && (await icon.text()).includes('<svg')),
      offlineReadable: Boolean(offline?.ok && (await offline.text()).includes('当前处于离线状态')) };
  });
  expect(evidence.names).toContain('unrelated-acceptance-cache');
  expect(evidence.iconReadable && evidence.offlineReadable).toBe(true);
  await info.attach('pwa-update', { contentType: 'application/json', body: JSON.stringify({
    project: info.project.name, browser: browser.version(), assertions: { newScriptActivated: true,
      oldPwaCacheRemoved: true, unrelatedCachePreserved: true, offlineAssetsReadableAfterUpdate: true },
  }, null, 2) });
});

// Failure boundary: actual network loss must render the offline document and icon,
// then online navigation must recover. WebKit offline emulation has a known defect.
test('PWA renders complete fallback during a real offline browser session @smoke', async ({ page, context, browser, browserName }, info) => {
  test.skip(browserName === 'webkit', 'Playwright WebKit offline SW navigation fails internally: https://github.com/microsoft/playwright/issues/42775');
  await visit(page, '/');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  try {
    await context.setOffline(true);
    await page.goto('/offline-acceptance', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '当前处于离线状态' })).toBeVisible();
    await expect.poll(async () => page.getByRole('img', { name: 'LiLink 飞鸟衔信标志' }).evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('pwa-offline-complete.png'), fullPage: true });
  } finally { await context.setOffline(false); }
  await visit(page, '/');
  await expect(page.getByRole('heading', { name: '让相遇这件事 值得被认真对待' })).toBeVisible();
  await info.attach('pwa-offline', { contentType: 'application/json', body: JSON.stringify({
    project: info.project.name, browser: browser.version(), viewport: page.viewportSize(),
    assertions: { actualOfflineNavigationRendered: true, offlineIconDecoded: true, onlineRecoveryRendered: true },
  }, null, 2) });
});

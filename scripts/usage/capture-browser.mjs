import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { chromium, devices } from '@playwright/test';
import { readDisposableSession, readComparisonSession, repositoryRoot } from '../performance/local-session.mjs';

const [sessionPath, outputPath] = process.argv.slice(2);
const pwaOnly = process.argv.includes('--pwa-only');
const publicMatrix = process.argv.includes('--public-matrix');
const homeJourneys = process.argv.includes('--home-journeys');
if ([pwaOnly, publicMatrix, homeJourneys].filter(Boolean).length > 1) throw new Error('Choose exactly one browser capture mode.');
const beforeIndex = process.argv.indexOf('--before');
if (!sessionPath || !outputPath) throw new Error('Usage: node scripts/usage/capture-browser.mjs artifacts/e2e/<run>/session.json <output-directory>');
const session = await readDisposableSession(sessionPath);
const baseline = beforeIndex === -1 ? null : await readComparisonSession(process.argv[beforeIndex + 1]);
if (baseline && baseline.session.runId !== session.runId) throw new Error('Baseline must belong to the same disposable session.');
const origin = new URL(baseline?.comparison.beforeUrl ?? session.webUrl).origin;
const apiOrigin = new URL(session.apiUrl).origin;
const cdnOrigin = session.cdnUrl ? new URL(session.cdnUrl).origin : null;
const workspace = baseline ? path.join(repositoryRoot, 'artifacts/performance', `baseline-${session.runId}`, 'workspace')
  : path.join(repositoryRoot, 'artifacts/e2e', session.runId, 'workspace');
const buildId = await readFile(path.join(workspace, 'apps/web/.next/BUILD_ID'), 'utf8')
  .then(value => value.trim(), error => { if (error.code === 'ENOENT') return null; throw error; });
await mkdir(outputPath, { recursive: true });
const samples = [];
const excludedUnassignedRequests = [];
const cacheOutputs = [];
for (const kind of pwaOnly ? [] : ['html', 'rsc']) {
  const response = await fetch(`${origin}/${kind === 'rsc' ? '?_rsc=usage-evidence' : ''}`, {
    headers: kind === 'rsc' ? { RSC: '1' } : {},
    signal: AbortSignal.timeout(10_000),
  });
  const body = Buffer.from(await response.arrayBuffer());
  cacheOutputs.push({ kind, status: response.status, contentType: response.headers.get('content-type'),
    decodedBytes: body.length, gzipBytes: gzipSync(body).length });
}
// Fail bounded raw-response reads before acquiring a browser process.
const browser = await chromium.launch();
const safePath = value => {
  const url = new URL(value);
  return url.pathname === '/_next/image' ? `${url.pathname}${url.search}` : url.pathname;
};
const headerBytes = headers => Object.entries(headers ?? {}).reduce((sum, [name, value]) => sum + Buffer.byteLength(`${name}: ${value}\r\n`), 2);
const classify = value => {
  const url = new URL(value);
  if (url.origin === apiOrigin) return 'direct-api';
  if (url.origin === cdnOrigin) return 'static-cdn';
  if (url.origin !== origin) return 'external';
  if (url.pathname === '/monitoring') return 'sentry-tunnel';
  if (url.pathname.startsWith('/api/')) return 'web-api';
  if (url.pathname === '/_next/image') return 'image-optimization';
  if (url.searchParams.has('_rsc')) return 'rsc';
  if (url.pathname.startsWith('/_next/static/')) return 'static';
  if (/\.[a-z0-9]+$/i.test(url.pathname)) return 'public-asset';
  return 'document';
};

try {
  for (const mode of pwaOnly ? [] : ['desktop', 'mobile']) {
    for (const journey of homeJourneys ? ['home-stay', 'home-leave', 'home-full']
      : publicMatrix ? ['home', 'about', 'schools', 'register', 'register-school']
      : ['home-chain', 'cold-about', 'cold-schools', 'cold-register']) {
    const context = await browser.newContext({
      ...(mode === 'mobile' ? devices['Pixel 7'] : { viewport: { width: 1280, height: 800 } }),
      baseURL: origin, locale: 'zh-CN', reducedMotion: 'reduce', serviceWorkers: 'block',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.enable');
    const mainFrame = (await cdp.send('Page.getFrameTree')).frameTree.frame.id;
    await cdp.send('Network.enable');
    const requests = new Map();
    const resourceLedger = [];
    const loaderScopes = new Map();
    const pending = [];
    let activeScenario;
    cdp.on('Network.requestWillBeSent', event => {
      if (!event.request.url.startsWith('http')) return;
      if (event.type === 'Document' && event.frameId === mainFrame) {
        loaderScopes.set(event.loaderId, activeScenario);
        for (const row of resourceLedger.filter(row => row.loaderId === event.loaderId && !row.scenario)) row.scenario = activeScenario;
      }
      if (event.redirectResponse && requests.has(event.requestId)) Object.assign(requests.get(event.requestId), {
        status: event.redirectResponse.status, completion: 'redirect',
        responseHeaderBytes: headerBytes(event.redirectResponse.headers),
        encodedTransferBytes: event.redirectResponse.encodedDataLength ?? 0,
      });
      const row = { path: safePath(event.request.url), category: classify(event.request.url),
        scenario: loaderScopes.get(event.loaderId) ?? null, loaderId: event.loaderId,
        attribution: homeJourneys ? 'document-loader-id-within-finite-journey'
          : publicMatrix ? 'document-loader-id' : 'document-loader-id-with-spa-phase',
        method: event.request.method, requestStartedAt: event.timestamp,
        resourceType: event.type, requestHeaderBytes: headerBytes(event.request.headers),
        requestBodyBytes: Buffer.byteLength(event.request.postData ?? ''), status: 0,
        fromDiskCache: false, fromMemoryCache: false, fromServiceWorker: false, encodedTransferBytes: 0,
        decodedBodyBytes: 0, gzipBodyBytes: 0, responseHeaderBytes: 0, partialEncodedDataBytes: 0, completion: 'incomplete' };
      if (!publicMatrix && !homeJourneys && event.type !== 'Document' && row.scenario) row.scenario = activeScenario;
      requests.set(event.requestId, row);
      resourceLedger.push(row);
    });
    cdp.on('Network.requestWillBeSentExtraInfo', event => {
      const row = requests.get(event.requestId);
      if (row) row.requestHeaderBytes = headerBytes(event.headers);
    });
    cdp.on('Network.requestServedFromCache', event => {
      const row = requests.get(event.requestId);
      if (row) row.fromMemoryCache = true;
    });
    cdp.on('Network.responseReceivedExtraInfo', event => {
      const row = requests.get(event.requestId);
      if (row) row.wireStatus = event.statusCode;
    });
    cdp.on('Network.responseReceived', event => {
      const row = requests.get(event.requestId);
      if (row) Object.assign(row, { status: event.response.status, fromDiskCache: !!event.response.fromDiskCache,
        fromServiceWorker: !!event.response.fromServiceWorker, responseHeaderBytes: headerBytes(event.response.headers),
        contentType: event.response.mimeType, contentEncoding: event.response.headers['content-encoding'] ?? null });
    });
    cdp.on('Network.dataReceived', event => {
      const row = requests.get(event.requestId);
      if (row) row.partialEncodedDataBytes += event.encodedDataLength;
    });
    cdp.on('Network.loadingFinished', event => {
      const row = requests.get(event.requestId);
      if (!row) return;
      row.encodedTransferBytes = event.encodedDataLength;
      row.completion = 'finished';
      pending.push(cdp.send('Network.getResponseBody', { requestId: event.requestId }).then(body => {
        const buffer = Buffer.from(body.body, body.base64Encoded ? 'base64' : 'utf8');
        row.decodedBodyBytes = buffer.length;
        row.gzipBodyBytes = gzipSync(buffer).length;
      }).catch(() => { row.bodyUnavailable = true; }));
    });
    cdp.on('Network.loadingFailed', event => {
      const row = requests.get(event.requestId);
      if (row) Object.assign(row, { failure: event.errorText, completion: 'failed' });
    });
    const sample = async (scenario, navigate, boundary = 'full-scroll') => {
      activeScenario = scenario;
      const started = Date.now();
      await navigate();
      await page.locator('main').first().waitFor({ state: 'visible' });
      if (new URL(page.url()).pathname === '/' && boundary === 'full-scroll') {
        await page.getByRole('heading', { name: '让相遇这件事 值得被认真对待' }).waitFor({ state: 'visible' });
        await page.getByRole('list', { name: '各学校已加入人数' }).waitFor({ state: 'visible' });
      }
      let journeyObservation;
      if (boundary !== 'full-scroll') {
        await page.getByRole('heading', { name: '让相遇这件事 值得被认真对待' }).waitFor({ state: 'visible' });
        await page.getByRole('link', { name: '了解更多', exact: true }).waitFor({ state: 'visible' });
        await page.waitForFunction(() => {
          const hero = document.querySelector('[data-home-hero]');
          const image = (hero ?? document.querySelector('main'))?.querySelector('img[fetchpriority="high"]');
          const visible = node => {
            if (!node || !node.getBoundingClientRect().width || !node.getBoundingClientRect().height) return false;
            for (let current = node; current; current = current.parentElement) {
              const style = getComputedStyle(current);
              if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) return false;
            }
            return true;
          };
          const previewElement = document.querySelector('[data-home-preview]') ?? hero;
          const preview = previewElement && visible(previewElement)
            && [getComputedStyle(previewElement), getComputedStyle(previewElement, '::before')]
            .some(style => style.backgroundImage !== 'none');
          const primaryLink = document.querySelector('main a[href="/dashboard"], main a[href="/register"]');
          return visible(primaryLink) && visible(hero ?? image) && (preview || (image?.complete && image.naturalWidth > 0));
        });
        const heroVisibleMs = Date.now() - started;
        if (boundary === 'early-leave') {
          await page.getByRole('link', { name: '了解更多', exact: true }).click();
          await page.waitForURL('**/about');
          await page.getByRole('heading', { name: '关于 LiLink', exact: true }).waitFor({ state: 'visible' });
        }
        await page.waitForTimeout(3000);
        journeyObservation = { boundary, heroVisibleMs, dwellMs: 3000,
          destination: new URL(page.url()).pathname, scrollY: await page.evaluate(() => scrollY) };
      } else await page.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * 0.8) {
          scrollTo(0, y);
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }
      });
      let networkSettled = true;
      if (boundary === 'full-scroll') {
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => { networkSettled = false; });
        await page.waitForFunction(() => [...document.images].filter(img => img.getBoundingClientRect().width > 0 && (img.loading !== 'lazy' || img.getBoundingClientRect().top < innerHeight)).every(img => img.complete && img.naturalWidth > 0), undefined, { timeout: 15_000 });
        await page.evaluate(() => scrollTo(0, 0));
      } else networkSettled = null;
      const screenshotPath = path.join(outputPath, `${mode}-${scenario}.png`);
      if (boundary === 'full-scroll') await page.screenshot({ path: screenshotPath, fullPage: true });
      else {
        // Playwright's font readiness wait can outlive the finite journey.
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(screenshotPath, Buffer.from(screenshot.data, 'base64'));
      }
      await Promise.allSettled(pending);
      const resources = resourceLedger.filter(row => row.scenario === scenario);
      const web = resources.filter(row => !['direct-api', 'external', 'static-cdn'].includes(row.category));
      const networkWeb = web.filter(row => !row.fromDiskCache && !row.fromMemoryCache && !row.fromServiceWorker);
      const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
      const countsByCategory = resources.reduce((result, row) => {
        result[row.category] = (result[row.category] ?? 0) + 1; return result;
      }, {});
      const cdn = resources.filter(row => row.category === 'static-cdn' && !row.fromDiskCache && !row.fromMemoryCache);
      const record = { networkSettled, journeyObservation, viewport: mode, size: page.viewportSize(), scenario, durationMs: Date.now() - started,
        countsByCategory, webRequestCount: web.length, webNetworkRequestCount: networkWeb.length,
        apiRequestCount: resources.filter(row => row.category === 'direct-api').length,
        cdnNetworkRequestCount: cdn.length, cdnTransferBytes: sum(cdn, 'encodedTransferBytes'),
        webTransferBytes: sum(web, 'encodedTransferBytes'), webBodyGzipEstimate: sum(networkWeb.filter(row => row.wireStatus !== 304), 'gzipBodyBytes'),
        estimatedWebRequestHeaderBytes: sum(networkWeb, 'requestHeaderBytes'),
        webResponseHeaderBytes: sum(networkWeb, 'responseHeaderBytes'),
        optimizedImageNetworkRequestCount: networkWeb.filter(row => row.category === 'image-optimization').length,
        estimatedImageReadUnits: networkWeb.filter(row => row.category === 'image-optimization')
          .reduce((total, row) => total + Math.ceil(row.decodedBodyBytes / 8192), 0),
        incompleteResources: networkWeb.filter(row => row.completion === 'incomplete').map(row => row.path),
        imageBodiesMissing: networkWeb.filter(row => row.category === 'image-optimization'
          && (row.bodyUnavailable || row.completion !== 'finished')).map(row => row.path),
        imageTransformationKeys: [...new Set(web.filter(row => row.category === 'image-optimization').map(row => row.path))],
        resources: structuredClone(resources) };
      samples.push(record);
      console.log(JSON.stringify({ viewport: mode, scenario, webRequestCount: record.webRequestCount,
        webNetworkRequestCount: record.webNetworkRequestCount, webTransferBytes: record.webTransferBytes,
        webBodyGzipEstimate: record.webBodyGzipEstimate, countsByCategory }));
      await writeFile(path.join(outputPath, 'browser-usage.json'), JSON.stringify({
        createdAt: new Date().toISOString(), runId: session.runId, buildId, browser: browser.version(), cacheOutputs,
        variant: baseline ? 'before' : 'after', publicMatrix, homeJourneys,
        journeyBoundaryRevision: homeJourneys ? 'visible-hero-finite-journeys-v1' : null,
        methodology: `${homeJourneys ? 'Finite homepage paths: visible hero then 3s no-scroll dwell; visible hero then immediate About navigation and 3s destination dwell; full-scroll visit and same-context full-scroll revisit. Finite paths do not await high-resolution decoding or network idle.' : 'Identical cold/warm full-page scrolling.'} Isolated Chromium, unthrottled loopback, synthetic data, service workers blocked. Full-document samples are owned by CDP loader ID; prior-document requests remain with the prior sample. CDP transfer includes local response headers; gzip bodies and optimizer read units are envelopes, not Vercel billing. Browser disk/memory/SW cache excluded from network requests. 304s remain requests; incomplete bodies remain explicit. SPA phase attribution is weaker and excluded from full-matrix comparisons. No long dwell polling is included.`,
        excludedUnassignedRequests: [...excludedUnassignedRequests,
          ...resourceLedger.filter(row => !row.scenario).map(row => ({ viewport: mode, journey, ...row }))], samples,
      }, null, 2));
    };
    if (homeJourneys) {
      const boundary = journey === 'home-stay' ? 'stay' : journey === 'home-leave' ? 'early-leave' : 'full-scroll';
      await sample(`cold-${journey}`, () => page.goto('/', { waitUntil: 'commit' }), boundary);
      if (journey === 'home-full') await sample('warm-home-revisit', () => page.goto('/', { waitUntil: 'domcontentloaded' }));
    } else if (publicMatrix) {
      const route = { home: '/', about: '/about', schools: '/schools', register: '/register', 'register-school': '/register/school' }[journey];
      await sample(`cold-${journey}`, () => page.goto(route, { waitUntil: 'domcontentloaded' }));
      await sample(`warm-${journey}`, () => page.goto(route, { waitUntil: 'domcontentloaded' }));
    } else if (journey === 'home-chain') {
    await sample('cold-home-full', () => page.goto('/', { waitUntil: 'domcontentloaded' }));
    await sample('warm-home-full', () => page.goto('/', { waitUntil: 'domcontentloaded' }));
    await sample('client-about-navigation', async () => {
      await page.getByRole('link', { name: '了解更多', exact: true }).click();
      await page.waitForURL('**/about');
      await page.getByRole('heading', { name: '关于 LiLink', exact: true }).waitFor({ state: 'visible' });
    });
    await sample('school-registration-navigation', () => page.goto('/register/school', { waitUntil: 'domcontentloaded' }));
    } else {
      const route = { 'cold-about': '/about', 'cold-schools': '/schools', 'cold-register': '/register/school' }[journey];
      await sample(journey, () => page.goto(route, { waitUntil: 'domcontentloaded' }));
    }
    excludedUnassignedRequests.push(...resourceLedger.filter(row => !row.scenario)
      .map(row => ({ viewport: mode, journey, ...row })));
    await context.close();
    }
  }
  const pwaContext = await browser.newContext({ baseURL: origin, serviceWorkers: 'allow' });
  try {
    const pwaPage = await pwaContext.newPage();
    const pwaCdp = await pwaContext.newCDPSession(pwaPage);
    await pwaCdp.send('Network.enable');
    let pwaPhase = 'installation';
    const pwaRequests = new Map();
    const workerRequests = [];
    const pwaPending = [];
    pwaCdp.on('Network.requestWillBeSent', event => {
      if (!event.request.url.startsWith('http')) return;
      pwaRequests.set(event.requestId, { phase: pwaPhase, path: safePath(event.request.url), category: classify(event.request.url),
        fromBrowserCache: false, fromServiceWorker: false, status: 0, completion: 'incomplete', encodedTransferBytes: 0 });
    });
    pwaCdp.on('Network.requestServedFromCache', event => {
      const row = pwaRequests.get(event.requestId); if (row) row.fromBrowserCache = true;
    });
    pwaCdp.on('Network.responseReceived', event => {
      const row = pwaRequests.get(event.requestId); if (row) Object.assign(row, { status: event.response.status,
        fromBrowserCache: row.fromBrowserCache || !!event.response.fromDiskCache, fromServiceWorker: !!event.response.fromServiceWorker });
    });
    pwaCdp.on('Network.loadingFinished', event => {
      const row = pwaRequests.get(event.requestId); if (row) Object.assign(row, { completion: 'finished', encodedTransferBytes: event.encodedDataLength });
    });
    pwaCdp.on('Network.loadingFailed', event => {
      const row = pwaRequests.get(event.requestId); if (row) Object.assign(row, { completion: 'failed', failure: event.errorText });
    });
    pwaContext.on('request', request => {
      if (!request.serviceWorker()) return;
      const row = { phase: pwaPhase, path: safePath(request.url()), category: classify(request.url()),
        status: 0, completion: 'incomplete', decodedBytes: null, request: request };
      workerRequests.push(row);
    });
    pwaContext.on('requestfinished', request => {
      const row = workerRequests.find(item => item.request === request);
      if (!row) return;
      pwaPending.push((async () => {
        const response = await request.response();
        row.status = response?.status() ?? 0;
        row.completion = 'finished';
        try {
          const body = await response.body(); row.decodedBytes = body.length; row.gzipBytes = gzipSync(body).length;
        } catch { row.bodyUnavailable = true; }
      })());
    });
    const pwaSamples = [];
    for (const phase of ['installation', 'installed-revisit']) {
      pwaPhase = phase;
      await pwaPage.goto('/', { waitUntil: 'load' });
      await pwaPage.waitForFunction(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return Boolean(registration?.active && navigator.serviceWorker.controller);
      }, undefined, { timeout: 20_000 });
      await pwaPage.evaluate(async () => {
        for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * 0.8) {
          scrollTo(0, y); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        }
      });
      let networkSettled = true;
      await pwaPage.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => { networkSettled = false; });
      await Promise.allSettled(pwaPending);
      const documentRequests = [...pwaRequests.values()].filter(row => row.phase === phase);
      const workerOwnedRequests = workerRequests.filter(row => row.phase === phase).map(({ request, ...row }) => row);
      const outgoing = documentRequests.filter(row => !row.fromBrowserCache && !row.fromServiceWorker
        && !['external', 'direct-api', 'static-cdn'].includes(row.category));
      const installationRequests = outgoing.filter(row => ['/sw.js', '/manifest.webmanifest'].includes(row.path));
      pwaSamples.push({ phase, networkSettled, documentRequests, workerOwnedRequests,
        documentNetworkRequestCount: outgoing.length,
        workerOwnedRequestCount: workerOwnedRequests.length,
        installationOverheadRequestCount: installationRequests.length + workerOwnedRequests.length,
        note: 'CDP excludes browser-cache and worker-served page responses; worker-owned fetches are separately observed. Worker HTTP-cache billing is not visible here.' });
    }
    const cachePaths = await pwaPage.evaluate(async () => {
      const names = await caches.keys();
      const result = [];
      for (const name of names.filter(value => value.startsWith('lilink-pwa-'))) {
        const cache = await caches.open(name);
        for (const request of await cache.keys()) result.push(new URL(request.url).pathname);
      }
      return result.sort();
    });
    const scriptUrl = await pwaPage.evaluate(async () => (await navigator.serviceWorker.ready).active.scriptURL);
    for (const sample of pwaSamples) {
      sample.installationOverheadRequestCount = sample.documentRequests.filter(row => !row.fromBrowserCache && !row.fromServiceWorker
        && ['/sw.js', '/manifest.webmanifest'].includes(row.path)).length
        + sample.workerOwnedRequests.filter(row => cachePaths.includes(row.path)
          || ['/sw.js', '/manifest.webmanifest'].includes(row.path)).length;
    }
    const evidence = pwaOnly ? { runId: session.runId, browser: browser.version(), createdAt: new Date().toISOString() }
      : JSON.parse(await readFile(path.join(outputPath, 'browser-usage.json'), 'utf8'));
    evidence.pwa = { serviceWorkerActivated: true, scriptPath: safePath(scriptUrl), cachePaths, samples: pwaSamples,
      extraRequestsPerNewInstallation: pwaSamples[0].installationOverheadRequestCount,
      note: 'Actual isolated installation and installed revisit requests are observed separately from SW-blocked public samples. No synthetic resource fetch is counted as an installation. Monthly installation/session count and production telemetry are unknown.' };
    await writeFile(path.join(outputPath, pwaOnly ? 'pwa-usage.json' : 'browser-usage.json'), JSON.stringify(evidence, null, 2));
  } finally { await pwaContext.close(); }
} finally { await browser.close(); }

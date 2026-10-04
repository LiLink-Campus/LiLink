import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { earlyScreenshot } from '../support/early-screenshot';

// Failure boundaries: About's atlas may stall, return 404 or fail to decode;
// its three complete crops, heading and native links must still render. Missing
// client chunks cannot hide either a direct visit or the first native click from
// the home preview. Preserve the existing entrance animation and reduced motion.
// Preview success never substitutes for HD decode, original crop geometry, one
// shared atlas request or complete cold/warm page images after scrolling.
const atlasPattern = '**/images/about/watercolor-atlas*';
const originalAtlas = '/images/about/watercolor-atlas.618382ffbabd.webp';

async function expectAboutPreview(page: Page) {
  const main = page.getByRole('main');
  await expect(page.getByRole('heading', { name: '关于 LiLink', exact: true })).toBeVisible();
  // The pre-existing CSS entrance may finish while scripts or HD remain held.
  await expect(main).toHaveCSS('opacity', '1');
  for (const name of ['我们的故事', '团队', '联系我们']) {
    await expect(main.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  const previews = page.locator('[data-about-preview]');
  await expect(previews).toHaveCount(3);
  for (const preview of await previews.all()) {
    await expect(preview).toBeVisible();
    await expect(preview).toHaveCSS('background-image', /data:image\/webp;base64,/);
    await expect(preview).toHaveCSS('background-size', '300% 100%');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  return main;
}

async function cropGeometry(page: Page) {
  return page.locator('[data-about-preview]').evaluateAll(elements => elements.map(element => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y + scrollY, width: box.width, height: box.height,
      crop: getComputedStyle(element).backgroundPosition };
  }));
}

async function expectCompleteArtwork(page: Page) {
  const hero = page.locator('img[data-page-image]');
  await expect(hero).toHaveCount(1);
  await expect.poll(() => hero.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await hero.evaluate((image: HTMLImageElement) => image.decode());
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * 0.8) {
      scrollTo(0, y);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
  });
  await expect.poll(() => page.evaluate(() => [...document.images]
    .filter(image => image.getBoundingClientRect().width > 0)
    .every(image => image.complete && image.naturalWidth > 0)), { timeout: 15_000 }).toBe(true);
  const artworks = await page.locator('[data-about-preview] img').evaluateAll(async elements => {
    const images = elements as HTMLImageElement[];
    await Promise.all(images.map(image => image.decode()));
    return images.map(image => ({ path: new URL(image.currentSrc).pathname,
      naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight }));
  });
  expect(artworks).toHaveLength(3);
  expect(artworks.every(image => image.path === originalAtlas && image.naturalWidth > 0 && image.naturalHeight > 0)).toBe(true);
  await page.evaluate(() => scrollTo(0, 0));
  await expectAboutPreview(page);
  return artworks;
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`about presents complete crops before its shared atlas completes (${reducedMotion}) @smoke`, async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion });
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const requests: string[] = [];
    await page.route(atlasPattern, async route => {
      requests.push(new URL(route.request().url()).pathname);
      await pending;
      await route.continue();
    });
    let before: Awaited<ReturnType<typeof cropGeometry>> = [];
    try {
      await page.goto('/about', { waitUntil: 'commit' });
      await expectAboutPreview(page);
      await expect.poll(() => requests.length).toBe(1);
      const decoded = await page.locator('img[data-page-image]').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0);
      expect(decoded).toBe(false);
      before = await cropGeometry(page);
      await info.attach(`about-preview-${reducedMotion}`, { contentType: 'image/png', body: await earlyScreenshot(page) });
      await info.attach('about-pending-contract', { contentType: 'application/json', body: JSON.stringify({
        requests, reducedMotion, headingVisible: true, previewCount: 3, hdDecoded: decoded,
      }, null, 2) });
    } finally { release(); }
    const artworks = await expectCompleteArtwork(page);
    const after = await cropGeometry(page);
    for (let index = 0; index < before.length; index++) {
      expect(after[index].crop).toBe(before[index].crop);
      for (const dimension of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(after[index][dimension] - before[index][dimension])).toBeLessThanOrEqual(0.5);
      }
    }
    expect(requests).toEqual([originalAtlas]);
    await info.attach(`about-hd-${reducedMotion}`, { contentType: 'image/png', body: await page.screenshot({ fullPage: true }) });
    await info.attach('about-shared-atlas-contract', { contentType: 'application/json', body: JSON.stringify({
      project: info.project.name, viewport: page.viewportSize(), reducedMotion, requests, before, after, artworks,
      assertions: { completePreviewBeforeHd: true, allThreeCropsPreserved: true,
        singleOriginalAtlasRequest: true, fullPageImagesDecoded: true, noHorizontalOverflow: true },
    }, null, 2) });
  });
}

for (const failure of ['not-found', 'invalid-image'] as const) {
  test(`about retains complete previews after atlas ${failure} @smoke`, async ({ page }, info) => {
    const failedRequests: string[] = [];
    await page.route(atlasPattern, async route => {
      failedRequests.push(new URL(route.request().url()).pathname);
      await route.fulfill({ status: failure === 'not-found' ? 404 : 200,
        contentType: 'image/webp', body: 'synthetic-undecodable-atlas' });
    });
    await page.goto('/about', { waitUntil: 'domcontentloaded' });
    await expectAboutPreview(page);
    const image = page.locator('img[data-page-image]');
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete)).toBe(true);
    expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(0);
    await info.attach(`about-${failure}`, { contentType: 'image/png', body: await page.screenshot({ fullPage: true }) });
    await page.getByRole('main').getByRole('link', { name: '查看介绍 ↗', exact: true }).first().click();
    await expect(page).toHaveURL(/\/about\/team\/yoryon$/);
    await expect(page.getByRole('heading', { name: '釉蓝yoryon', exact: true })).toBeVisible();
    // Failed responses need not share the successful image cache across crops.
    expect(failedRequests.length).toBeGreaterThanOrEqual(1);
    expect(failedRequests.length).toBeLessThanOrEqual(3);
    expect(failedRequests.every(path => path === originalAtlas)).toBe(true);
    await info.attach('about-failed-atlas-contract', { contentType: 'application/json', body: JSON.stringify({
      project: info.project.name, failure, failedRequests,
      assertions: { completePreviewRemainsVisible: true, decodeFailureObserved: true, memberLinkWorks: true },
    }, null, 2) });
  });
}

for (const scriptState of ['delayed-15s', 'failed', 'disabled'] as const) {
  test.describe(`about scripts ${scriptState}`, () => {
    test.use({ javaScriptEnabled: scriptState !== 'disabled' });
    test(`about renders on direct and early native navigation (${scriptState}) @smoke`, async ({ page }, info) => {
      test.setTimeout(60_000);
      let release!: () => void;
      const pending = new Promise<void>(resolve => { release = resolve; });
      let blockedScripts = 0;
      let timer: NodeJS.Timeout | undefined;
      if (scriptState !== 'disabled') {
        await page.route('**/*', async route => {
          if (route.request().resourceType() !== 'script') return route.continue();
          blockedScripts += 1;
          if (scriptState === 'failed') return route.abort();
          await pending;
          return route.continue();
        });
      }
      try {
        await page.goto('/about', { waitUntil: 'commit' });
        await expectAboutPreview(page);
        await info.attach(`about-direct-${scriptState}`, { contentType: 'image/png', body: await earlyScreenshot(page) });
        await page.goto('/', { waitUntil: 'commit' });
        const home = page.locator('[data-home-hero]');
        await expect(home.getByRole('heading', { name: /让相遇这件事/ })).toBeVisible();
        await expect(page.locator('[data-home-preview]')).toHaveCSS('background-image', /data:image\/webp;base64,/);
        const request = page.waitForRequest(request => request.isNavigationRequest()
          && new URL(request.url()).pathname === '/about');
        const clickedAt = Date.now();
        await home.getByRole('link', { name: '了解更多', exact: true }).click({ noWaitAfter: true });
        await request;
        await expect(page).toHaveURL(/\/about$/);
        await expectAboutPreview(page);
        const previewObservedAfterClickMs = Date.now() - clickedAt;
        await info.attach(`about-native-${scriptState}`, { contentType: 'image/png', body: await earlyScreenshot(page) });
        if (scriptState !== 'disabled') expect(blockedScripts).toBeGreaterThan(0);
        if (scriptState === 'delayed-15s') {
          timer = setTimeout(release, 15_000);
          await pending;
          await expectAboutPreview(page);
        }
        await info.attach('about-native-first-click-contract', { contentType: 'application/json', body: JSON.stringify({
          project: info.project.name, viewport: page.viewportSize(), scriptState, blockedScripts, previewObservedAfterClickMs,
          assertions: { directHtmlVisibleWithoutClientInitialization: true,
            earlyClickUsesDocumentNavigation: true, targetVisibleBeforeClientScripts: true },
          note: 'Click timing includes assertion polling; production comparison uses the separate performance runner.',
        }, null, 2) });
      } finally {
        if (timer) clearTimeout(timer);
        release();
        await page.unrouteAll({ behavior: 'ignoreErrors' });
      }
    });
  });
}

test('complete About artwork cold and warm navigation evidence @smoke', async ({ page, browser }, info) => {
  const samples = [];
  for (const cache of ['cold-context', 'warm-revisit']) {
    await page.goto('/about', { waitUntil: 'domcontentloaded' });
    await expectAboutPreview(page);
    const artworks = await expectCompleteArtwork(page);
    samples.push(await page.evaluate(({ cacheState, decodedArtwork }) => ({
      cache: cacheState, completeVisibleMs: performance.now(), decodedArtwork,
      artwork: performance.getEntriesByType('resource')
        .filter(entry => entry.name.includes('/images/about/watercolor-atlas'))
        .map(entry => {
          const resource = entry as PerformanceResourceTiming;
          const url = new URL(resource.name);
          return { origin: url.origin, path: url.pathname, durationMs: resource.duration,
            transferBytes: resource.transferSize, encodedBytes: resource.encodedBodySize,
            decodedBytes: resource.decodedBodySize };
        }),
    }), { cacheState: cache, decodedArtwork: artworks }));
    const resources = samples.at(-1)!.artwork;
    expect(resources).toHaveLength(1);
    expect(resources[0].origin).toBe(process.env.E2E_WEB_URL);
    expect(resources[0].path).toBe(originalAtlas);
    const response = await page.request.get(`${resources[0].origin}${resources[0].path}`);
    expect(response.ok()).toBe(true);
    expect(response.headers()['cache-control']).toContain('immutable');
    await info.attach(`about-complete-${cache}`, { contentType: 'image/png', body: await page.screenshot({ fullPage: true }) });
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
  }
  await info.attach('complete-first-screen-performance', { contentType: 'application/json', body: JSON.stringify({
    browser: browser.version(), project: info.project.name, viewport: page.viewportSize(),
    motion: 'reduce', network: 'unthrottled-loopback', cpu: 'unthrottled', serviceWorkers: 'blocked',
    note: 'Complete visibility requires original HD atlas decode and all visible page images; timing includes assertion overhead. Cold means a new context, not a cold server.',
    samples,
  }, null, 2) });
});

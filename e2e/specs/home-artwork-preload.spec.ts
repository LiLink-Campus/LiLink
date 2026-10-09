import type { Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';

// Failure boundaries: a pending, missing or undecodable hero must retain the
// complete preview and native links. Delayed fonts must not hide, clip or overlap
// the heading and CTAs. The image must load once, replace the preview in place,
// and survive scrolling, revisiting and actual browser back/forward navigation.
const artworkPattern = '**/*campus-blossom-scene-anime*';

async function expectHomePreview(page: Page) {
  const hero = page.locator('[data-home-hero]');
  await expect(hero.getByRole('heading', { name: /让相遇这件事/ })).toBeVisible();
  for (const name of ['开始匹配 →', '了解更多']) {
    await expect(hero.getByRole('link', { name, exact: true })).toBeVisible();
  }
  const preview = page.locator('[data-home-preview]');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveCSS('background-image', /url\(["']?data:image\//);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  return hero;
}

async function heroLayout(page: Page) {
  const layout = await page.locator('[data-home-hero]').evaluate(element => {
    const heading = element.querySelector('h1')!.getBoundingClientRect().toJSON();
    const links = [...element.querySelectorAll('a')].map(link => {
      const text = document.createRange();
      text.selectNodeContents(link);
      return { label: link.textContent, box: link.getBoundingClientRect().toJSON(), text: text.getBoundingClientRect().toJSON() };
    });
    return { heading, links };
  });
  for (const link of layout.links) {
    expect(link.box.height).toBeGreaterThanOrEqual(44);
    expect(link.text.left).toBeGreaterThanOrEqual(link.box.left - 0.5);
    expect(link.text.right).toBeLessThanOrEqual(link.box.right + 0.5);
    expect(link.text.top).toBeGreaterThanOrEqual(link.box.top - 0.5);
    expect(link.text.bottom).toBeLessThanOrEqual(link.box.bottom + 0.5);
  }
  const [first, second] = layout.links.map(link => link.box);
  expect(Math.min(first.right, second.right) > Math.max(first.left, second.left)
    && Math.min(first.bottom, second.bottom) > Math.max(first.top, second.top)).toBe(false);
  return layout;
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`homepage presents its preview before one responsive artwork completes (${reducedMotion}) @smoke`, async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion });
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    let releaseFonts!: () => void;
    const fontsPending = new Promise<void>(resolve => { releaseFonts = resolve; });
    const fontRequests: string[] = [];
    await page.route('**/fonts/*.woff2', async route => {
      fontRequests.push(new URL(route.request().url()).pathname);
      await fontsPending;
      await route.continue();
    });
    const artworkRequests: string[] = [];
    await page.route(artworkPattern, async route => {
      const url = new URL(route.request().url());
      artworkRequests.push(url.pathname + url.search);
      await pending;
      await route.continue();
    });
    let pendingBox: { x: number; y: number; width: number; height: number } | null = null;
    let fontLayout: { pending: Awaited<ReturnType<typeof heroLayout>>; ready: Awaited<ReturnType<typeof heroLayout>> } | null = null;
    try {
      await page.goto('/', { waitUntil: 'commit' });
      const hero = await expectHomePreview(page);
      await expect.poll(() => artworkRequests.length).toBe(1);
      const image = hero.locator('img[data-page-image]');
      await expect(image).toHaveCount(1);
      expect(await image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(false);
      const responsive = await image.evaluate((element: HTMLImageElement) => ({ srcSet: element.srcset, sizes: element.sizes }));
      const matchingPreload = await page.locator('head link[rel="preload"][as="image"]').evaluateAll((links, selected) =>
        links.some(link => link.getAttribute('imagesrcset') === selected.srcSet && link.getAttribute('imagesizes') === selected.sizes), responsive);
      expect(matchingPreload).toBe(true);

      // Compare image replacement after the independent page entrance animation.
      // The first-preview assertion above does not wait for this animation.
      await page.getByRole('main').evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
      pendingBox = await hero.boundingBox();
      await expect.poll(() => fontRequests.length).toBeGreaterThan(0);
      const pendingFontLayout = await heroLayout(page);
      releaseFonts();
      await expect.poll(() => page.evaluate(() => [...document.fonts].some(font => font.status === 'loaded')
        && [...document.fonts].every(font => font.status !== 'loading' && font.status !== 'error'))).toBe(true);
      await expectHomePreview(page);
      const readyFontLayout = await heroLayout(page);
      for (const dimension of ['x', 'y', 'width', 'height'] as const) {
        expect(Math.abs(readyFontLayout.heading[dimension] - pendingFontLayout.heading[dimension])).toBeLessThanOrEqual(0.5);
        for (let index = 0; index < pendingFontLayout.links.length; index++) {
          expect(Math.abs(readyFontLayout.links[index].box[dimension] - pendingFontLayout.links[index].box[dimension])).toBeLessThanOrEqual(0.5);
        }
      }
      fontLayout = { pending: pendingFontLayout, ready: readyFontLayout };
    } finally { release(); releaseFonts(); }
    const hero = await expectHomePreview(page);
    const image = hero.locator('img[data-page-image]');
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    await image.evaluate((element: HTMLImageElement) => element.decode());
    const readyBox = await hero.boundingBox();
    expect(pendingBox).not.toBeNull();
    expect(readyBox).not.toBeNull();
    for (const dimension of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(readyBox![dimension] - pendingBox![dimension])).toBeLessThanOrEqual(0.5);
    }
    expect(artworkRequests).toHaveLength(1);
    const selectedArtwork = await image.evaluate((element: HTMLImageElement) => new URL(element.currentSrc).pathname);
    expect(artworkRequests[0]).toBe(selectedArtwork);
    expect(selectedArtwork).not.toContain('/_next/image');

    await page.locator('#faq').scrollIntoViewIfNeeded();
    await page.locator('#faq summary').filter({ hasText: 'LiLink 是什么？' }).click();
    await expect(page.getByText('LiLink 是面向高校学生的匹配平台。', { exact: false })).toBeVisible();
    await page.getByRole('heading', { name: '准备好了吗？', exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('main').getByRole('link', { name: '立即加入', exact: true })).toBeVisible();
    await page.evaluate(() => scrollTo(0, 0));
    await expectHomePreview(page);
    expect(artworkRequests).toHaveLength(1);
    await info.attach('home-artwork-contract', { contentType: 'application/json', body: JSON.stringify({
      project: info.project.name, viewport: page.viewportSize(), reducedMotion, requests: artworkRequests, selectedArtwork,
      pendingBox, readyBox, fontRequests, fontLayout,
      assertions: { visibleWhileArtworkPending: true, sameResponsivePreload: true, noDuplicateArtwork: true,
        directStaticArtwork: true, noHeroLayoutJump: true, scrollAndFaqUsable: true,
        visibleDuringFontDelay: true, buttonsNotClippedOrOverlapping: true, fontSwapWithinHalfPixel: true },
    }, null, 2) });
  });
}

for (const failure of ['not-found', 'invalid-image'] as const) {
  test(`homepage keeps the complete preview after ${failure} @smoke`, async ({ page }, info) => {
    let failedRequests = 0;
    await page.route(artworkPattern, async route => {
      failedRequests += 1;
      await route.fulfill({ status: failure === 'not-found' ? 404 : 200, contentType: 'image/webp', body: 'synthetic-undecodable-artwork' });
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const hero = await expectHomePreview(page);
    const image = hero.locator('img[data-page-image]');
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete)).toBe(true);
    expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(0);
    expect(failedRequests).toBe(1);

    await hero.getByRole('link', { name: '开始匹配 →', exact: true }).click();
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await expect(page.getByLabel('邮箱', { exact: true })).toBeEnabled();
    await info.attach('failed-artwork-contract', { contentType: 'application/json', body: JSON.stringify({
      project: info.project.name, failure, failedRequests,
      assertions: { previewRemainsVisible: true, imageFailureObserved: true, matchingLinkReachesUsableLogin: true },
    }, null, 2) });
  });
}

test('homepage remains complete on warm revisit and browser back/forward @smoke', async ({ page, browser }, info) => {
  const samples = [];
  for (const cache of ['cold-context', 'browser-back', 'browser-forward', 'warm-revisit']) {
    if (cache === 'browser-back') {
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      await page.goBack({ waitUntil: 'domcontentloaded' });
    } else if (cache === 'browser-forward') {
      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await page.goBack({ waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(/\/login(?:\?|$)/);
      await page.goForward({ waitUntil: 'domcontentloaded' });
    } else {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
    }
    await expect(page).toHaveURL(process.env.E2E_WEB_URL + '/');
    const hero = await expectHomePreview(page);
    await expect.poll(() => hero.locator('img[data-page-image]').evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);
    samples.push(await hero.locator('img[data-page-image]').evaluate((element: HTMLImageElement, cacheState) => ({
      cache: cacheState, selectedArtwork: new URL(element.currentSrc).pathname,
      resources: performance.getEntriesByType('resource').filter(entry => entry.name.includes('campus-blossom-scene-anime')).map(entry => ({
        path: new URL(entry.name).pathname, transferBytes: (entry as PerformanceResourceTiming).transferSize,
      })),
    }), cache));

  }
  const firstArtwork = samples[0].selectedArtwork;
  expect(samples.every(sample => sample.selectedArtwork === firstArtwork)).toBe(true);
  // History restoration may reuse its document without a new resource timing.
  expect(samples.every(sample => sample.resources.length <= 1)).toBe(true);
  expect(samples[0].resources.length).toBe(1);
  await page.locator('[data-home-hero]').getByRole('link', { name: '开始匹配 →', exact: true }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByLabel('邮箱', { exact: true })).toBeEnabled();
  await info.attach('home-revisit-contract', { contentType: 'application/json', body: JSON.stringify({
    project: info.project.name, browser: browser.version(), viewport: page.viewportSize(), samples,
    assertions: { previewAndHdVisibleOnEveryVisit: true, noDuplicateArtworkPerNavigation: true,
      actualBackAndForwardRestoredHome: true, restoredMatchingLinkReachesUsableLogin: true },
  }, null, 2) });
});

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

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
  }
  await info.attach('complete-first-screen-performance', { contentType: 'application/json', body: JSON.stringify({
    browser: browser.version(), project: info.project.name, viewport: page.viewportSize(),
    motion: 'reduce', network: 'unthrottled-loopback', cpu: 'unthrottled', serviceWorkers: 'blocked',
    note: 'Complete visibility requires original HD atlas decode and all visible page images; timing includes assertion overhead. Cold means a new context, not a cold server.',
    samples,
  }, null, 2) });
});

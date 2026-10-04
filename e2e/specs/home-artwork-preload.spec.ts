import type { Page, TestInfo } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { earlyScreenshot } from '../support/early-screenshot';

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

async function capture(page: Page, info: TestInfo, name: string) {
  await info.attach(name, { contentType: 'image/png', body: await page.screenshot() });
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
      await info.attach(`home-preview-${reducedMotion}`, { contentType: 'image/png', body: await earlyScreenshot(page) });
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
    await capture(page, info, `home-hd-${reducedMotion}`);
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
    await capture(page, info, `home-${failure}`);
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
    await capture(page, info, `home-${cache}`);
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

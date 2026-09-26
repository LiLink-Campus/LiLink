import { test, expect } from '../support/fixtures';

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`about waits for artwork before showing complete content (${reducedMotion}) @smoke`, async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion });
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    let requested = false;
    await page.route('**/images/about/watercolor-atlas*', async route => {
      requested = true;
      await pending;
      await route.continue();
    });
    try {
      await page.goto('/about', { waitUntil: 'domcontentloaded' });
      await expect.poll(() => requested).toBeTruthy();
      await expect(page.locator('main')).toHaveAttribute('aria-busy', 'true');
      await expect(page.getByRole('heading', { name: '关于 LiLink' })).toBeHidden();
      await expect(page.getByRole('status').filter({ hasText: '正在加载页面' })).toBeVisible();
      // Screenshots wait for font/layout readiness, which can depend on this held image.
      await info.attach(`artwork-pending-${reducedMotion}`, { contentType: 'application/json', body: JSON.stringify({
        requested, busy: await page.locator('main').getAttribute('aria-busy'),
        headingVisible: await page.getByRole('heading', { name: '关于 LiLink' }).isVisible(), reducedMotion,
      }) });
    } finally { release(); }
    await expect(page.locator('main')).toHaveAttribute('data-image-ready', 'true');
    await expect(page.getByRole('heading', { name: '关于 LiLink' })).toBeVisible();
    await expect(page.locator('main')).toHaveCSS('opacity', '1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: info.outputPath(`artwork-ready-${reducedMotion}.png`), fullPage: true });
  });
}

test('failed artwork retains bounded fallback @smoke', async ({ page }) => {
  await page.route('**/images/about/watercolor-atlas*', route => route.abort());
  await page.goto('/about', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('main')).toHaveAttribute('data-image-ready', 'true');
  await expect(page.getByRole('heading', { name: '关于 LiLink' })).toBeVisible();
});

test('stalled artwork releases the page within the existing deadline @smoke', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/images/about/watercolor-atlas*', async route => {
    await pending;
    await route.abort();
  });
  try {
    await page.goto('/about', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '关于 LiLink' })).toBeHidden();
    await expect(page.locator('main')).toHaveAttribute('data-image-ready', 'true', { timeout: 10_000 });
    await expect(page.getByRole('heading', { name: '关于 LiLink' })).toBeVisible();
  } finally { release(); }
});

test('complete artwork cold and warm navigation evidence @smoke', async ({ page, browser }, info) => {
  const samples = [];
  for (const cache of ['cold-context', 'warm-revisit']) {
    await page.goto('/about', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toHaveAttribute('data-image-ready', 'true');
    await expect(page.getByRole('heading', { name: '关于 LiLink' })).toBeVisible();
    await expect(page.locator('main')).toHaveCSS('opacity', '1');
    samples.push(await page.evaluate(cacheState => ({
      cache: cacheState,
      completeVisibleMs: performance.now(),
      artwork: performance.getEntriesByType('resource')
        .filter(entry => entry.name.includes('/images/about/watercolor-atlas'))
        .map(entry => {
          const resource = entry as PerformanceResourceTiming;
          return { path: new URL(resource.name).pathname, durationMs: resource.duration,
            transferBytes: resource.transferSize, encodedBytes: resource.encodedBodySize,
            decodedBytes: resource.decodedBodySize };
        }),
    }), cache));
    const artworkResponse = await page.request.get(samples.at(-1)!.artwork[0].path);
    expect(artworkResponse.headers()['cache-control']).toContain('immutable');
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
  }
  expect(samples.every(sample => sample.artwork.length > 0)).toBeTruthy();
  await info.attach('complete-first-screen-performance', { contentType: 'application/json', body: JSON.stringify({
    browser: browser.version(), project: info.project.name, viewport: page.viewportSize(),
    motion: 'reduce', network: 'unthrottled-loopback', cpu: 'unthrottled', serviceWorkers: 'blocked',
    note: 'Observed complete visibility includes assertion polling overhead; cold means a new browser context, not a cold server.', samples,
  }, null, 2) });
});

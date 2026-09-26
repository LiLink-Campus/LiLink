import { test, expect } from '../support/fixtures';

test('homepage preloads the displayed responsive artwork and keeps the image gate @smoke', async ({ page }, info) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const artworkRequests: string[] = [];
  await page.route('**/_next/image?*', async route => {
    const imageUrl = new URL(route.request().url());
    if (imageUrl.searchParams.get('url') !== '/images/campus-blossom-scene-anime.webp') {
      await route.continue();
      return;
    }
    artworkRequests.push(imageUrl.pathname + imageUrl.search);
    await pending;
    await route.continue();
  });
  const main = page.getByRole('main');
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Scope to the presented document; React may still hold a hidden streamed segment.
    const hero = main.locator('img[data-page-image]');
    await expect(hero).toHaveCount(1);
    const imageSrcSet = await hero.getAttribute('srcset');
    const preload = page.locator('head link[rel="preload"][as="image"]');
    const matchingPreload = await preload.evaluateAll((links, srcSet) => links.some(link => link.getAttribute('imagesrcset') === srcSet && link.getAttribute('imagesizes') === '100vw'), imageSrcSet);
    expect(matchingPreload).toBeTruthy();
    await expect.poll(() => artworkRequests.length).toBe(1);
    await expect(main).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('heading', { name: /让相遇这件事/ })).toBeHidden();
    // Capture the pending contract without waiting for image-dependent font/layout readiness.
    await info.attach('home-artwork-pending', { contentType: 'application/json', body: JSON.stringify({
      artworkRequests, busy: await main.getAttribute('aria-busy'),
      headingVisible: await page.getByRole('heading', { name: /让相遇这件事/ }).isVisible(),
    }) });
  } finally { release(); }
  await expect(main).toHaveAttribute('data-image-ready', 'true');
  await expect(page.getByRole('heading', { name: /让相遇这件事/ })).toBeVisible();
  await expect(page.locator('img[data-page-image]')).toHaveCount(1);
  expect(artworkRequests).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: info.outputPath('home-artwork-ready.png') });
  await info.attach('home-artwork-requests', { contentType: 'application/json', body: JSON.stringify({
    project: info.project.name, viewport: page.viewportSize(), requests: artworkRequests,
    assertions: { sameResponsivePreload: true, hiddenUntilArtworkReady: true, noDuplicateArtwork: true },
  }, null, 2) });
});

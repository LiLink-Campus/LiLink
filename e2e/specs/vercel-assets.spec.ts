import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect, visit, api } from '../support/fixtures';

// Failure boundaries: scripts, fonts, CSS and visible images must load from
// the Web origin, decode and hydrate; static images must bypass the optimizer,
// retain responsive candidates and immutable URLs; all 28 school marks must
// remain named and visibly cropped. Old published image URLs must still work.
test('public navigation loads complete assets from the Vercel Web origin @smoke', async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  const origin = process.env.E2E_WEB_URL!;
  const missing: string[] = [];
  const externalAssets: string[] = [];
  const errors: string[] = [];
  const webResources = new Set<string>();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    const url = new URL(response.url());
    if (url.origin === origin && /^\/(?:_next\/(?:static|image)|images\/|fonts\/|icons\/)/.test(url.pathname)) {
      webResources.add(url.pathname);
      if (response.status() >= 400) missing.push(`${response.status()} ${url.pathname}`);
    }
    if (url.origin !== origin && /^\/(?:_next\/(?:static|image)|images\/|fonts\/|icons\/)/.test(url.pathname)) {
      externalAssets.push(url.origin + url.pathname);
    }
  });
  const samples = [];
  for (const route of ['/', '/about', '/about/team/yoryon', '/one-to-one', '/schools', '/register/school']) {
    await visit(page, route);
    await expect(page.getByRole('main').last()).toBeVisible();
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * 0.8) {
        scrollTo(0, y);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
    });
    await expect.poll(async () => await page.evaluate(() => [...document.images]
      .filter(image => image.getBoundingClientRect().width > 0)
      .every(image => image.complete && image.naturalWidth > 0)), { timeout: 15_000 }).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const images = await page.evaluate(() => [...document.images]
      .filter(image => image.getBoundingClientRect().width > 0).map(image => ({
        alt: image.alt, path: new URL(image.currentSrc).pathname, srcset: image.srcset,
        naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
      })));
    expect(images.every(image => image.path !== '/_next/image')).toBe(true);
    expect(images.filter(image => image.path.startsWith('/images/responsive/')).every(image => image.srcset.includes('w'))).toBe(true);
    if (route === '/schools') {
      const logos = page.locator('[data-school-logo]');
      await expect(logos).toHaveCount(28);
      const marks = await logos.evaluateAll(elements => elements.map(element => {
        const box = element.getBoundingClientRect();
        const image = element.querySelector('img')!;
        const crop = image.parentElement!;
        const cropBox = crop.getBoundingClientRect();
        return { school: image.alt, id: image.dataset.schoolId, width: box.width, height: box.height,
          slotWidth: element.parentElement!.getBoundingClientRect().width,
          cropWidth: cropBox.width, cropHeight: cropBox.height,
          clipped: getComputedStyle(crop).overflow === 'hidden', imagePath: new URL(image.currentSrc).pathname };
      }));
      expect(new Set(marks.map(mark => mark.id)).size).toBe(28);
      expect(marks.every(mark => mark.school.length > 2 && mark.width > 0 && mark.width <= mark.slotWidth + 0.1
        && mark.height > 0 && mark.height <= 80 && mark.cropWidth > 0 && mark.cropWidth <= mark.width + 0.1
        && mark.cropHeight > 0 && mark.cropHeight <= mark.height + 0.1
        && mark.clipped && mark.imagePath.startsWith('/images/school-atlases/'))).toBe(true);
      await info.attach('school-mark-crops', { contentType: 'application/json', body: JSON.stringify(marks, null, 2) });
    }
    samples.push({ route, renderedImages: images.length, images,
      sameOriginScripts: await page.locator("script[src]").evaluateAll(scripts => scripts.every(script => new URL((script as HTMLScriptElement).src).origin === location.origin)) });
    await page.screenshot({ path: info.outputPath(`${route.replaceAll('/', '-') || 'home'}-vercel-assets.png`), fullPage: true });
  }
  await page.getByLabel('学校邮箱', { exact: true }).fill('assets@school.example.test');
  await expect(page.getByText(/✓.*自动化|✓.*验收/)).toBeVisible();
  expect(errors).toEqual([]);
  expect(samples.every(sample => sample.sameOriginScripts)).toBe(true);
  expect(missing).toEqual([]);
  expect(externalAssets).toEqual([]);
  expect([...webResources].some(value => value.startsWith('/_next/static/'))).toBe(true);
  expect([...webResources].some(value => value.startsWith('/_next/image'))).toBe(false);
  const resource = [...webResources].find(value => value.endsWith('.js'))!;
  const response = await page.request.get(`${origin}${resource}`);
  expect(response.headers()['cache-control']).toContain('immutable');
  const hashedAssets = [...webResources].filter(value => /\.[a-f0-9]{12}\.(?:webp|svg)$/.test(value));
  expect(hashedAssets.length).toBeGreaterThan(0);
  for (const asset of hashedAssets) {
    const immutable = await page.request.get(`${origin}${asset}`);
    expect(immutable.ok()).toBe(true);
    expect(immutable.headers()['cache-control']).toContain('max-age=31536000');
    expect(immutable.headers()['cache-control']).toContain('immutable');
  }
  const legacyPaths = ['/images/campus-blossom-scene-anime.webp', '/images/about/member-01.png', '/images/schools/bupt.png'];
  const legacy = [];
  for (const asset of legacyPaths) {
    const redirect = await page.request.get(`${origin}${asset}`, { maxRedirects: 0 });
    expect(redirect.status()).toBe(308);
    const target = new URL(redirect.headers().location, origin);
    expect(target.origin).toBe(origin);
    const resolved = await page.request.get(target.href);
    expect(resolved.ok()).toBe(true);
    expect(resolved.headers()['content-type']).toContain('image/');
    legacy.push({ path: asset, target: target.pathname, status: resolved.status() });
  }
  await info.attach('vercel-assets-acceptance', { contentType: 'application/json', body: JSON.stringify({
    project: info.project.name, browser: browser.version(), viewport: page.viewportSize(), samples, assetCount: webResources.size,
    immutableAssets: hashedAssets, legacy,
    assertions: { noMissingAssets: true, noJavascriptErrors: true, sameOriginAssets: true,
      allVisibleImagesDecoded: true, scriptsHydrated: true, immutableChunkHeaders: true,
      directResponsiveStaticImages: true, immutableImageHeaders: true, oldUrlsResolvable: true, allSchoolMarksVisibleAndNamed: true },
  }, null, 2) });
});

// Cache boundaries are checked against real HTTP bodies, including every
// published content address, mutable paths, missing lookalikes and user data.
test('asset caching preserves content digests and excludes mutable or private responses @smoke', async ({ request, context, signedIn }, info) => {
  void signedIn;
  const publicRoot = path.join(process.env.E2E_WORKSPACE!, 'apps/web/public');
  const checks: { path: string; status: number; cache: string; sha256?: string }[] = [];
  async function verify(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) { await verify(file); continue; }
      const match = entry.name.match(/\.([a-f0-9]{12})\.(?:webp|png|jpe?g|svg|woff2|ico)$/);
      if (!match) continue;
      const route = `/${path.relative(publicRoot, file).split(path.sep).join('/')}`;
      const response = await request.get(route);
      expect(response.status(), route).toBe(200);
      const body = await response.body();
      const sha256 = createHash('sha256').update(body).digest('hex');
      expect(sha256.slice(0, 12), route).toBe(match[1]);
      expect(body.equals(await readFile(file)), route).toBe(true);
      const cache = response.headers()['cache-control'] ?? '';
      expect(cache, route).toContain('max-age=31536000');
      expect(cache, route).toContain('immutable');
      checks.push({ path: route, status: response.status(), cache, sha256 });
    }
  }
  for (const directory of ['images', 'icons', 'fonts']) await verify(path.join(publicRoot, directory));
  for (const route of ['/images/letter-sprig.svg', '/icons/contact/mail.svg', '/fonts/long-cang.woff2',
    '/images/missing.000000000000.webp', '/icons/missing.000000000000.svg', '/fonts/missing.000000000000.woff2',
    '/images/missing.fakehash.webp', '/images/letter-sprig.000000000000.svg', '/images/missing.000000000000.txt', '/', '/login']) {
    const response = await request.get(route);
    const cache = response.headers()['cache-control'] ?? '';
    const missing = route.includes('missing') || route.includes('letter-sprig.000');
    expect(response.status(), route).toBe(missing ? 404 : 200);
    expect(cache, route).not.toContain('immutable');
    expect(cache, route).not.toContain('max-age=31536000');
    if (missing || route === '/login') expect(cache, route).toContain('no-store');
    if (route === '/images/letter-sprig.svg') expect(cache).toContain('max-age=3600');
    checks.push({ path: route, status: response.status(), cache });
  }
  for (const route of ['/me/vip', '/me/referral']) {
    const response = await context.request.get(`${api}${route}`);
    expect(response.status(), route).toBe(200);
    const cache = response.headers()['cache-control'] ?? '';
    expect(cache, route).not.toContain('public');
    expect(cache, route).not.toMatch(/immutable|(?:s-maxage|max-age)=\d*[1-9]/);
    checks.push({ path: route, status: response.status(), cache });
  }
  await info.attach('content-address-and-cache-boundaries', { contentType: 'application/json', body: JSON.stringify({
    project: info.project.name, checks,
    assertions: { publishedBytesAndDigestsPreserved: true, allPublishedHashesImmutable: true,
      mutableAndMissingAssetsNeverImmutable: true, pagesAndPrivateApisExcluded: true },
  }, null, 2) });
});

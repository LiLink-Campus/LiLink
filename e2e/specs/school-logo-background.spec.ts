import { test, expect } from '@playwright/test';
import sharp from 'sharp';

// Failure boundaries: all 28 names remain; representative detail survives compositing; white
// backing plates match the actual surrounding page on desktop/mobile and both engines,
// with normal motion and reduced motion, including retained page-entry animation layers.
// Alberta's source-white top/bottom margins are independent of the CSS technique.
const matteProbes = [0.25, 0.5, 0.75, 0.9].flatMap(x => [0.08, 0.92].map(y => ({ x, y })));
type RGB = [number, number, number];
const difference = (a: RGB, b: RGB) => Math.max(...a.map((value, index) => Math.abs(value - b[index])));

for (const motion of ['no-preference', 'reduce'] as const) {
test(`representative school logos blend white backing and retain visible detail (${motion}) @smoke @webkit`, async ({ page, browser }, info) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: motion });
  await page.goto('/schools', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '园区中外合作高校' })).toBeVisible();
  // Let real entry animations finish without disabling their retained compositing layers.
  await expect.poll(async () => await page.evaluate(() => [...document.querySelectorAll('main')]
    .flatMap(element => element.getAnimations()).every(animation => !animation.pending && animation.playState !== 'running'))).toBe(true);
  const motionEnvironment = await page.evaluate(() => ({
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    pageAnimations: [...document.querySelectorAll('main')].flatMap(element => element.getAnimations()
      .map(animation => ({ playState: animation.playState, pending: animation.pending }))),
  }));
  expect(motionEnvironment.reducedMotion).toBe(motion === 'reduce');
  const images = page.locator('img[data-school-id]');
  await expect(images).toHaveCount(28);
  const names = await images.evaluateAll(elements => elements.map(element => ({
    id: (element as HTMLImageElement).dataset.schoolId!, alt: (element as HTMLImageElement).alt,
  })));
  expect(new Set(names.map(logo => logo.id)).size).toBe(28);
  expect(new Set(names.map(logo => logo.alt)).size).toBe(28);
  expect(names.every(logo => logo.alt.length > 2)).toBe(true);

  // Decode source and screenshot bytes only; never alter the published image assets.
  const original = await page.request.get('/images/schools/alberta-mark.png');
  expect(original.ok()).toBe(true);
  const source = await sharp(await original.body()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const sourceMargins = matteProbes.map(probe => {
    const x = Math.min(source.info.width - 1, Math.floor(probe.x * source.info.width));
    const y = Math.min(source.info.height - 1, Math.floor(probe.y * source.info.height));
    const offset = (y * source.info.width + x) * source.info.channels;
    return { ...probe, rgb: [...source.data.subarray(offset, offset + 3)], alpha: source.data[offset + 3] };
  });
  expect(sourceMargins.every(probe => probe.rgb.every(value => value >= 250) && probe.alpha === 255)).toBe(true);
  const samples = [];
  for (const logo of names.filter(logo => ['alberta', 'bupt'].includes(logo.id))) {
    const image = page.locator(`img[data-school-id="${logo.id}"]`);
    await image.evaluate(element => element.parentElement!.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
    await expect(image).toBeVisible();
    await image.evaluate(async element => await (element as HTMLImageElement).decode());
    const area = await image.evaluate(element => {
      const crop = element.parentElement!.getBoundingClientRect();
      return { crop: { x: crop.x, y: crop.y, width: crop.width, height: crop.height },
        fullyVisible: crop.x >= 0 && crop.y >= 0 && crop.right <= innerWidth && crop.bottom <= innerHeight,
        surroundingVisible: crop.x >= 5 && crop.y >= 5 && crop.right + 5 <= innerWidth && crop.bottom + 5 <= innerHeight };
    });
    expect(area.crop.width).toBeGreaterThan(0);
    expect(area.crop.height).toBeGreaterThan(0);
    expect(area.fullyVisible, `${logo.alt}: complete visible crop is inside the viewport`).toBe(true);
    expect(area.surroundingVisible, `${logo.alt}: surrounding background samples are inside the viewport`).toBe(true);
    // getBoundingClientRect and the full viewport screenshot share viewport coordinates.
    const screenshot = await page.screenshot({ scale: 'css' });
    const rendered = await sharp(screenshot).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number): RGB => {
      const offset = (Math.max(0, Math.min(rendered.info.height - 1, Math.floor(y))) * rendered.info.width
        + Math.max(0, Math.min(rendered.info.width - 1, Math.floor(x)))) * rendered.info.channels;
      return [...rendered.data.subarray(offset, offset + 3)] as RGB;
    };
    const surrounding = [pixel(area.crop.x - 5, area.crop.y - 5),
      pixel(area.crop.x + area.crop.width + 5, area.crop.y - 5),
      pixel(area.crop.x - 5, area.crop.y + area.crop.height + 5),
      pixel(area.crop.x + area.crop.width + 5, area.crop.y + area.crop.height + 5)];
    const background = [0, 1, 2].map(channel => [...surrounding.map(color => color[channel])]
      .sort((a, b) => a - b)[1]) as RGB;
    expect(surrounding.every(color => difference(color, background) <= 2)).toBe(true);
    const startX = area.crop.x;
    const startY = area.crop.y;
    let inkPixels = 0;
    let whitePlatePixels = 0;
    let totalPixels = 0;
    for (let y = 1; y < area.crop.height - 1; y++) {
      for (let x = 1; x < area.crop.width - 1; x++) {
        const color = pixel(startX + x, startY + y);
        const delta = difference(color, background);
        if (delta > 12) inkPixels++;
        if (Math.min(...color) >= 245 && Math.max(...color) - Math.min(...color) <= 4
          && Math.max(...color.map((value, channel) => value - background[channel])) > 3) whitePlatePixels++;
        totalPixels++;
      }
    }
    const margins = logo.id === 'alberta' ? matteProbes.map(probe => {
      const color = pixel(startX + probe.x * area.crop.width, startY + probe.y * area.crop.height);
      return { ...probe, color, difference: difference(color, background) };
    }) : [];
    samples.push({ ...logo, background, crop: area.crop, inkPixels, whitePlatePixels, totalPixels, margins });
    expect.soft(inkPixels, `${logo.alt}: visible strokes remain`).toBeGreaterThan(Math.max(12, totalPixels * 0.01));
    expect.soft(whitePlatePixels, `${logo.alt}: no white backing plate against the page`).toBeLessThanOrEqual(2);
    if (margins.length) {
      expect.soft(margins.every(probe => probe.difference <= 3), 'Alberta source-white margins match the actual page').toBe(true);

    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await info.attach('school-logo-background-acceptance', { contentType: 'application/json', body: JSON.stringify({
    project: info.project.name, browser: browser.version(), viewport: page.viewportSize(),
    motion, motionEnvironment, sourceMargins, samples,
    assertions: { namedLogos: 28, backgroundFromSurroundingRenderedPixels: true,
      sourceWhiteMarginsBlend: samples.find(logo => logo.id === 'alberta')!.margins.every(probe => probe.difference <= 3),
      sampledVisibleDetailRetained: samples.every(logo => logo.inkPixels > Math.max(12, logo.totalPixels * 0.01)),
      sampledNoVisibleWhiteBacking: samples.every(logo => logo.whitePlatePixels <= 2) },
  }, null, 2) });
});
}

const listName = '各学校已加入人数';
const snapshotRequest = /\/(?:api\/)?public\/(?:home|community)(?:$|[/?])/;
import type { Locator, Page } from '@playwright/test';
import { test, expect, visit } from '../support/fixtures';

// Playwright's WebKit fallback treats every closed details descendant as hidden,
// even when ::details-content is rendered. Check native visibility and hit testing
// only for this desktop case; mobile keeps normal locator actionability checks.
async function expectRendered(locator: Locator, nativeVisibility = false) {
  if (!nativeVisibility) return expect(locator).toBeVisible();
  await expect.poll(() => locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    return element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      && box.width > 0 && box.height > 0;
  })).toBe(true);
}

async function clickRendered(page: Page, locator: Locator, nativeVisibility = false) {
  if (!nativeVisibility) return locator.click();
  await expectRendered(locator, true);
  const target = await locator.evaluate(element => {
    const box = element.getBoundingClientRect();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    return { x, y, hit: element.contains(document.elementFromPoint(x, y)) };
  });
  expect(target.hit).toBe(true);
  await page.mouse.click(target.x, target.y);
}

const mainNavigation = (page: Page) => page.locator('nav[aria-label="主导航"]');

// Failure boundaries: missing client chunks must not hide the server-rendered
// hero or intercept native links. An already-open native menu must survive
// hydration, close on navigation or Escape, and remain usable at its breakpoint.
for (const scriptState of ['held', 'failed', 'disabled'] as const) {
  test.describe(`homepage scripts ${scriptState}`, () => {
    test.use({ javaScriptEnabled: scriptState !== 'disabled' });
    test(`preview links navigate before client initialization (${scriptState}) @smoke`, async ({ page }, info) => {
      test.setTimeout(60_000);
      const observations = [];
      let blockedScripts = 0;
      let releaseScripts!: () => void;
      let delayTimer: NodeJS.Timeout | undefined;
      const scriptsReady = new Promise<void>(resolve => { releaseScripts = resolve; });
      if (scriptState !== 'disabled') {
        await page.route('**/*', async route => {
          if (route.request().resourceType() !== 'script') return route.continue();
          blockedScripts += 1;
          if (scriptState === 'failed') return route.abort();
          await scriptsReady;
          return route.continue();
        });
      }
      try {
        for (const target of [
          { label: '了解更多', href: '/about', destination: /\/about$/ },
          { label: '开始匹配 →', href: '/dashboard', destination: /\/login(?:\?|$)/ },
        ]) {
          await page.goto('/', { waitUntil: 'commit' });
          const hero = page.locator('[data-home-hero]');
          await expect(hero.getByRole('heading', { name: /让相遇这件事/ })).toBeVisible();
          await expect(page.locator('[data-home-preview]')).toHaveCSS('background-image', /url\(["']?data:image\//);
          const link = hero.getByRole('link', { name: target.label, exact: true });
          await expect(link).toBeVisible();
          await expect(link).toHaveAttribute('href', target.href);
          const observedAt = await page.evaluate(() => performance.now());
          const documentRequest = page.waitForRequest(request => request.isNavigationRequest()
            && new URL(request.url()).pathname === target.href);
          // Click as soon as the preview is observable; do not wait for fonts or HD.
          await link.click({ noWaitAfter: true });
          await documentRequest;
          await expect(page).toHaveURL(target.destination);
          if (target.href === '/about') {
            await expect(page.getByRole('heading', { name: '关于 LiLink', exact: true })).toBeVisible();
            await expect(page.locator('[data-about-preview]')).toHaveCount(3);
          }
          observations.push({ target: target.href, previewObservedMs: observedAt, nativeDocumentNavigation: true });
        }
        if (scriptState !== 'disabled') expect(blockedScripts).toBeGreaterThan(0);
        if (scriptState === 'held') {
          // The destination also remains without chunks for the full delay.
          await expect(page.getByLabel('邮箱', { exact: true })).toBeDisabled();
          releaseScripts();
          await scriptsReady;
          await expect(page.getByLabel('邮箱', { exact: true })).toBeEnabled();
        }
        await info.attach('native-first-click-contract', { contentType: 'application/json', body: JSON.stringify({
          project: info.project.name, viewport: page.viewportSize(), scriptState, blockedScripts, observations,
          assertions: { previewBeforeClientInitialization: true, bothHeroLinksNavigateNatively: true,
            ...(scriptState === 'held' ? { usableLoginAfterDelayedScripts: true } : {}) },
        }, null, 2) });
      } finally {
        if (delayTimer) clearTimeout(delayTimer);
        releaseScripts();
        await page.unrouteAll({ behavior: 'ignoreErrors' });
      }
    });
  });
}

for (const scriptsEnabled of [false, true]) {
  test.describe(`public navigation scripts ${scriptsEnabled}`, () => {
    test.use({ javaScriptEnabled: scriptsEnabled });
    test(`public navigation is usable across consuming pages (scripts ${scriptsEnabled}) @smoke`, async ({ page, browserName }, info) => {
      test.setTimeout(120_000);
      const samples = [];
      for (const route of ['/', '/about', '/login']) {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        const toggle = page.getByRole('button', { name: '导航菜单', exact: true });
        const nav = mainNavigation(page);
        const mobile = page.viewportSize()!.width <= 760;
        const nativeVisibility = browserName === 'webkit' && !mobile;
        if (mobile) {
          await expect(toggle).toBeVisible();
          await expect(nav).toBeHidden();
          await toggle.click();
          await expect(nav).toHaveCSS('opacity', '1');
          await expect(nav).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
        } else {
          await expect(toggle).toBeHidden();
        }
        await expectRendered(nav, nativeVisibility);
        for (const label of ['关于我们', '支持的学校', '登录']) {
          await expectRendered(nav.getByRole('link', { name: label, exact: true, includeHidden: nativeVisibility }), nativeVisibility);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

        samples.push({ route, mobile, nativeVisibility, visibleNavigation: true, overflow: false });
      }
      const nativeVisibility = browserName === 'webkit' && page.viewportSize()!.width > 760;
      await clickRendered(page, mainNavigation(page).getByRole('link', {
        name: '支持的学校', exact: true, includeHidden: nativeVisibility,
      }), nativeVisibility);
      await expect(page).toHaveURL(/\/schools$/);
      if (page.viewportSize()!.width <= 760) await expect(mainNavigation(page)).toBeHidden();
      await info.attach('public-navigation-contract', { contentType: 'application/json', body: JSON.stringify({
        project: info.project.name, viewport: page.viewportSize(), scriptsEnabled, samples,
        assertions: { allPublicConsumersVisible: true, nativeNavigationWorks: true, menuClosesOnNavigation: true },
      }, null, 2) });
    });
  });
}

test('native menu opened before hydration remains usable afterward @smoke @mobile', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>(resolve => { releaseScripts = resolve; });
  await page.route('**/_next/static/**/*.js', async route => {
    await scriptsReady;
    await route.continue();
  });
  try {
    await page.goto('/', { waitUntil: 'commit' });
    const toggle = page.getByRole('button', { name: '导航菜单', exact: true });
    const nav = page.getByRole('navigation', { name: '主导航', exact: true });
    await expect(toggle).toBeVisible();
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(nav).toBeVisible();
    await expect(nav).toHaveCSS('opacity', '1');

    // Start the hydration deadline only when client scripts are released.
    const hydrated = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/auth/me'));
    releaseScripts();
    await hydrated;
    await expect(nav).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(nav).toBeHidden();
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Space');
    await expect(nav).toBeVisible();
    await nav.getByRole('link', { name: '支持的学校', exact: true }).click();
    await expect(page).toHaveURL(/\/schools$/);
    await expect(nav).toBeHidden();
    await info.attach('menu-hydration-contract', { contentType: 'application/json', body: JSON.stringify({
      project: info.project.name,
      assertions: { keyboardBeforeHydration: true, openStateSurvivesHydration: true,
        escapeClosesAndFocusesToggle: true, keyboardAfterHydration: true, navigationClosesMenu: true },
    }, null, 2) });
  } finally {
    releaseScripts();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
});

test('public navigation stays usable on both sides of its breakpoint @smoke @webkit', async ({ page, browserName }, info) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const samples = [];
  for (const width of [760, 761]) {
    await page.setViewportSize({ width, height: 844 });
    const toggle = page.getByRole('button', { name: '导航菜单', exact: true });
    const nav = mainNavigation(page);
    if (width <= 760) {
      await expect(toggle).toBeVisible();
      await expect(nav).toBeHidden();
      await toggle.click();
      await expect(nav).toBeVisible();
      await expect(nav).toHaveCSS('opacity', '1');
      await expect(nav).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');

      await toggle.click();
      await expect(nav).toBeHidden();
    } else {
      await expect(toggle).toBeHidden();
      await expectRendered(nav, browserName === 'webkit');

    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    samples.push({ width, menuToggleVisible: width <= 760, overflow: false });
  }
  await info.attach('menu-breakpoint-contract', { contentType: 'application/json', body: JSON.stringify({ project: info.project.name, samples }, null, 2) });
});

test('homepage keeps its server snapshot while open and after visibility resumes @smoke', async ({ page, browser }, info) => {
  const browserReads: string[] = [];
  page.on('request', request => {
    if (snapshotRequest.test(request.url()) || request.resourceType() === 'eventsource') {
      browserReads.push(new URL(request.url()).pathname);
    }
  });
  await page.route(snapshotRequest, route => route.fulfill({ status: 503, json: { message: 'Browser snapshot reads are disabled' } }));
  await page.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(document, 'hidden', { get: () => hidden });
    Object.defineProperty(window, 'setAcceptanceHidden', { value: (value: boolean) => {
      hidden = value; document.dispatchEvent(new Event('visibilitychange'));
    } });
  });
  await page.clock.install({ time: new Date('2026-10-04T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-04T00:00:01Z'));
  await visit(page, '/');
  const stats = page.getByRole('region', { name: '平台数据' });
  const schools = page.getByRole('list', { name: listName });
  await expect(stats).toBeVisible();
  await expect(schools).toBeVisible();
  await expect(stats.locator('strong')).toHaveCount(3);
  const displayedStats = await stats.locator('strong').allTextContents();
  expect(displayedStats.slice(0, 2).every(value => /^\d+$/.test(value)
    && Number.isSafeInteger(Number(value)) && Number(value) >= 0)).toBe(true);
  expect(displayedStats[2]).toMatch(/^(?:\d+|正在准备首轮匹配)$/);
  expect(displayedStats).not.toContain('—');
  const initialStats = await stats.innerText();
  const initialSchools = await schools.innerText();
  await page.clock.fastForward(31 * 60_000);
  expect(await stats.innerText()).toBe(initialStats);
  expect(await schools.innerText()).toBe(initialSchools);
  expect(browserReads).toEqual([]);
  await page.evaluate(() => (window as unknown as { setAcceptanceHidden: (value: boolean) => void }).setAcceptanceHidden(true));
  await page.clock.fastForward(5 * 60_000);
  await page.evaluate(() => (window as unknown as { setAcceptanceHidden: (value: boolean) => void }).setAcceptanceHidden(false));
  await page.clock.runFor(1_000);
  expect(await stats.innerText()).toBe(initialStats);
  expect(await schools.innerText()).toBe(initialSchools);
  expect(browserReads).toEqual([]);
  await expect(page.getByText(/更新暂时失败|人数统计暂时不可用|正在加载人数统计/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await info.attach('public-home-server-snapshot', { contentType: 'application/json', body: JSON.stringify({
    project: info.project.name, browser: browser.version(), viewport: page.viewportSize(), browserReads,
    assertions: { platformStatisticsVisible: true, schoolStatisticsVisible: true,
      noBrowserRefreshAfter31Minutes: true, noRefreshDuringHidden5Minutes: true,
      noRefreshOnVisibilityResume: true, serverSnapshotPreserved: true },
  }, null, 2) });
});

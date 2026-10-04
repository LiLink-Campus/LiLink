import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../support/fixtures';
import { earlyScreenshot } from '../support/early-screenshot';

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
for (const scriptState of ['delayed-15s', 'failed', 'disabled'] as const) {
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
          observations.push({ target: target.href, previewObservedMs: observedAt, nativeDocumentNavigation: true });
        }
        if (scriptState !== 'disabled') expect(blockedScripts).toBeGreaterThan(0);
        if (scriptState === 'delayed-15s') {
          // The destination also remains without chunks for the full delay.
          delayTimer = setTimeout(releaseScripts, 15_000);
          await expect(page.getByLabel('邮箱', { exact: true })).toBeDisabled();
          await scriptsReady;
          await expect(page.getByLabel('邮箱', { exact: true })).toBeEnabled();
        }
        await info.attach('native-first-click-contract', { contentType: 'application/json', body: JSON.stringify({
          project: info.project.name, viewport: page.viewportSize(), scriptState, blockedScripts, observations,
          assertions: { previewBeforeClientInitialization: true, bothHeroLinksNavigateNatively: true,
            ...(scriptState === 'delayed-15s' ? { usableLoginAfterDelayedScripts: true } : {}) },
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
      for (const route of ['/', '/about', '/one-to-one', '/schools', '/about/team/yoryon', '/updates', '/terms', '/privacy', '/login', '/register', '/register/school', '/register/personal', '/forgot-password']) {
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
        await info.attach(`navigation-${route.replaceAll('/', '-') || 'home'}`, {
          contentType: 'image/png', body: await page.screenshot(),
        });
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

test('native menu opened before hydration remains usable afterward @smoke', async ({ page }, info) => {
  test.skip(page.viewportSize()!.width > 760, 'The expandable menu is mobile-only.');
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
    await info.attach('menu-open-before-hydration', { contentType: 'image/png', body: await earlyScreenshot(page) });
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

test('public navigation stays usable on both sides of its breakpoint @smoke', async ({ page, browserName }, info) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const samples = [];
  for (const width of [759, 760, 761, 1280]) {
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
      await info.attach(`menu-${width}-expanded`, { contentType: 'image/png', body: await page.screenshot() });
      await toggle.click();
      await expect(nav).toBeHidden();
    } else {
      await expect(toggle).toBeHidden();
      await expectRendered(nav, browserName === 'webkit');
      await info.attach(`menu-${width}-desktop`, { contentType: 'image/png', body: await page.screenshot() });
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    samples.push({ width, menuToggleVisible: width <= 760, overflow: false });
  }
  await info.attach('menu-breakpoint-contract', { contentType: 'application/json', body: JSON.stringify({ project: info.project.name, samples }, null, 2) });
});

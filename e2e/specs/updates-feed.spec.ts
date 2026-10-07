import { test, expect, visit } from '../support/fixtures';

// Failure boundaries: navigation must never revive the removed unread feature;
// old/unavailable storage cannot break the list, pagination, fallback or article.
test.skip(!process.env.E2E_DEVLOG_MODE, 'Use --devlog-fixture with disposable upstream data.');

for (const storage of ['absent', 'old', 'recent', 'blocked']) {
  test(`updates remain usable without unread requests or storage (${storage}) @smoke`, async ({ page, context, browser }, info) => {
    const obsoleteRequests: string[] = [];
    context.on('request', request => {
      if (new URL(request.url()).pathname === '/api/devlog/latest') obsoleteRequests.push(request.url());
    });
    await context.addInitScript(({ storage }) => {
      const key = 'lilink.devlog.lastSeen';
      if (storage === 'old' || storage === 'recent') localStorage.setItem(key, storage === 'old' ? '2020-01-01' : '2099-01-01');
      const audit: string[] = [];
      Object.assign(window, { unreadAudit: audit });
      for (const operation of ['getItem', 'setItem', 'removeItem'] as const) {
        const original = Storage.prototype[operation];
        Storage.prototype[operation] = function (name: string, ...args: string[]) {
          if (name === key) audit.push(operation);
          if (storage === 'blocked') throw new DOMException('Synthetic storage denied', 'SecurityError');
          return Reflect.apply(original, this, [name, ...args]);
        };
      }
      const dispatch = window.dispatchEvent.bind(window);
      window.dispatchEvent = event => {
        if (event.type === 'lilink:devlog-last-seen-updated') audit.push('event');
        return dispatch(event);
      };
    }, { storage });
    const audits: string[][] = [];
    const inspect = async (target = page) => {
      await expect(target.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(target.getByRole('status', { name: '有新更新' })).toHaveCount(0);
      expect(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      audits.push(await target.evaluate(() => (window as unknown as { unreadAudit: string[] }).unreadAudit));
    };
    await visit(page, '/');
    await page.getByRole('contentinfo').getByRole('link', { name: '更新日志', exact: true }).click();
    await expect(page).toHaveURL(/\/updates$/);
    await inspect();
    if (process.env.E2E_DEVLOG_MODE === 'items') {
      await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(12);
      await page.getByRole('link', { name: '下一页', exact: true }).click();
      await expect(page).toHaveURL(/\/updates\?page=2$/);
      await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(2);
      await expect(page.getByText('第 2 / 2 页 · 共 14 条')).toBeVisible();
      const popupReady = context.waitForEvent('page');
      await page.getByRole('link', { name: '合成产品更新 2（在新标签页打开）', exact: true }).click();
      const popup = await popupReady;
      await expect(popup.getByRole('heading', { name: '合成文章 2' })).toBeVisible();
      await popup.close();
      await page.goBack();
      await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(12);
      await visit(page, '/updates?page=999');
      await expect(page).toHaveURL(/\/updates\?page=2$/);
    } else {
      await expect(page.getByText('最近还没有可展示的更新', { exact: false })).toBeVisible();
      await expect(page.getByRole('navigation', { name: '更新列表分页' })).toHaveCount(0);
      await expect(page.getByRole('main').getByRole('link', { name: 'devlog', exact: true })).toBeVisible();
    }
    await inspect();
    await page.reload();
    await inspect();
    const second = await context.newPage();
    await visit(second, '/about');
    await inspect(second);
    await page.getByRole('contentinfo').getByRole('link', { name: '关于我们', exact: true }).click();
    await inspect();
    await page.goBack();
    await inspect();
    expect(obsoleteRequests).toEqual([]);
    expect(audits.flat()).toEqual([]);
    const retired = await context.request.get('/api/devlog/latest');
    expect(retired.status()).toBe(404);
    expect(retired.headers()['cache-control']).not.toContain('immutable');
    await page.bringToFront();
    await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    // History restoration can replace animation promises; inspect the live set.
    await expect.poll(() => page.evaluate(() =>
      document.getAnimations().filter(animation => {
        const duration = animation.effect?.getComputedTiming().endTime;
        return typeof duration === 'number' && Number.isFinite(duration) && duration <= 5000
          && animation.playState !== 'finished' && animation.playState !== 'idle';
      }).length,
    )).toBe(0);
    await page.screenshot({ path: info.outputPath(`updates-${storage}.png`), fullPage: true });
    await info.attach('updates-feed-acceptance', { contentType: 'application/json', body: JSON.stringify({
      project: info.project.name, browser: browser.version(), viewport: page.viewportSize(),
      storage, feedMode: process.env.E2E_DEVLOG_MODE, obsoleteRequests, storageAndEventCalls: audits.flat(),
      retiredEndpointStatus: retired.status(), assertions: {
        navigationRefreshBackAndSecondTabUsable: true, noBadgeRequestsOrStorage: true,
        feedPaginationOrResilientFallbackUsable: true, oldEndpointRetired: true,
      },
    }, null, 2) });
  });
}

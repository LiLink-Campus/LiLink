import { test, expect, api, password, visit } from '../support/fixtures';

// Idle auxiliary links must not fetch unused routes. Actual pointer, keyboard,
// touch and immediate navigation must still reach an editable business page.
for (const surface of ['center', 'admin'] as const) {
  for (const intent of ['pointer', 'keyboard', 'touch', 'immediate'] as const) {
    test.describe(`${surface}/${intent}`, () => {
      if (intent === 'touch') test.use({ hasTouch: true });
      test(`${surface} auxiliary navigation preserves ${intent} intent @smoke`, async ({ page, signedIn, account, context, db }, info) => {
        void signedIn;
        if (surface === 'admin') {
          const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
          const admin = await db.adminOperator.create({ data: {
            email: `prefetch-${account.email}`, passwordHash: user.passwordHash, displayName: '验收管理员',
          } });
          const response = await context.request.post(`${api}/admin-session/login`, {
            data: { email: admin.email, password },
          });
          expect(response.ok()).toBeTruthy();
        }
        const requests: { path: string; prefetch: boolean; rsc: boolean }[] = [];
        page.on('request', request => {
          const url = new URL(request.url());
          if (!url.pathname.startsWith('/dashboard') && !url.pathname.startsWith('/admin')) return;
          const headers = request.headers();
          requests.push({ path: url.pathname, prefetch: headers['next-router-prefetch'] === '1', rsc: headers.rsc === '1' });
        });
        await visit(page, surface === 'center' ? '/dashboard/me' : '/admin');
        await expect(page.getByRole('heading', { name: surface === 'center' ? '用户中心' : '运营概览', exact: true })).toBeVisible();
        if (surface === 'admin' && info.project.name.startsWith('mobile')) {
          await page.getByRole('button', { name: '展开菜单', exact: true }).click();
        }
        const targetPath = surface === 'center' ? '/dashboard/referrals' : '/admin/merchants';
        const link = page.locator(`a[href="${targetPath}"]`).filter({ visible: true }).first();
        await link.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1500);
        const idle = requests.slice();
        expect(idle.filter(row => row.path === targetPath)).toHaveLength(0);
        if (surface === 'center') expect(idle.filter(row => row.path === '/dashboard/coupons')).toHaveLength(0);
        if (intent === 'pointer') await link.hover();
        if (intent === 'keyboard') await link.focus();
        if (intent === 'pointer' || intent === 'keyboard') {
          await expect.poll(() => requests.some(row => row.path === targetPath && row.rsc)).toBe(true);
        }
        const start = performance.now();
        if (intent === 'touch') await link.tap();
        else if (intent === 'keyboard') await page.keyboard.press('Enter');
        else await link.click();
        await expect(page).toHaveURL(new RegExp(`${targetPath}$`));
        await expect(page.getByRole('main').getByRole('heading', { name: surface === 'center' ? '我的邀请' : '合作商家', exact: true })).toBeVisible();
        const clickReadyMs = performance.now() - start;
        await info.attach('intent-navigation', { contentType: 'application/json', body: JSON.stringify({
          project: info.project.name, viewport: page.viewportSize(), surface, intent, idle, requests, clickReadyMs,
          assertions: { auxiliaryIdleRequestAbsent: true, actualDestinationVisible: true },
        }) });
        await info.attach('intent-destination', { contentType: 'image/png', body: await page.screenshot() });
        await page.goBack();
        await expect(page.getByRole('heading', { name: surface === 'center' ? '用户中心' : '运营概览', exact: true })).toBeVisible();
      });
    });
  }
}

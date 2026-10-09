import { test, expect, api, visit, completeProfile } from '../support/fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const privatePaths = ['/me/dashboard', '/me/bootstrap', '/me/contact-preferences', ...['home', 'profile', 'center'].map(page => `/me/page-bootstrap/${page}`)];

async function contractRule(context: import('@playwright/test').BrowserContext, path: string, mode: string) {
  const cookies = await context.cookies(api);
  const cookie = cookies.filter(item => item.name === 'lilink_token').map(item => `${item.name}=${item.value}`).join('; ');
  expect(cookie).not.toBe('');
  const result = await context.request.post(`${process.env.E2E_CONTRACT_PROXY_URL}/__e2e_contract`, { data: { cookie, path: `/v1${path}`, mode } });
  expect(result.status()).toBe(204);
}

for (const entry of [
  { endpoint: 'home', route: '/dashboard', text: '自动化同学' },
  { endpoint: 'profile', route: '/dashboard/profile', text: '我的资料' },
  { endpoint: 'center', route: '/dashboard/me', text: '账号安全' },
]) {
  test(`SSR ${entry.endpoint} rejects actual upstream invalid JSON and recovers`, async ({ page, context, db, signedIn }, info) => {
    void signedIn;
    if (entry.endpoint === 'profile') await completeProfile(context, db);
    await contractRule(context, `/me/page-bootstrap/${entry.endpoint}`, 'invalid');
    try {
      await visit(page, entry.route);
      await expect(page.getByRole('heading', { name: '暂时无法加载', exact: true })).toBeVisible();

      const proxy = await (await context.request.get(`${process.env.E2E_CONTRACT_PROXY_URL}/__e2e_contract`)).json();
      expect(proxy.hits).toBeGreaterThan(0);
      await info.attach('SSR-upstream-proof', { body: JSON.stringify({ endpoint: entry.endpoint, upstreamInjectionHits: proxy.hits }), contentType: 'application/json' });
      await contractRule(context, `/me/page-bootstrap/${entry.endpoint}`, 'compatible');
      if (entry.endpoint === 'profile') {
        const compatible = await (await context.request.get(`${api}/me/page-bootstrap/profile`)).json();
        expect(compatible.savedQuestionnaire).not.toBeNull();
        expect(compatible.savedQuestionnaire).not.toHaveProperty('vipFiltersActive');
      }
      await page.getByRole('button', { name: '重新加载', exact: true }).click();
      await expect(page.getByRole('main')).toContainText(entry.text);
      await expect(page.getByRole('heading', { name: '暂时无法加载', exact: true })).toHaveCount(0);

    } finally { await contractRule(context, `/me/page-bootstrap/${entry.endpoint}`, 'off'); }
  });
}

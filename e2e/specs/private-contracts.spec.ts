import { test, expect, api, password, visit, completeProfile } from '../support/fixtures';
import { randomUUID } from 'node:crypto';

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
    test.skip(!process.env.E2E_CONTRACT_PROXY_URL, 'Run with --contract-proxy to inject the Web server to API path.');
    if (entry.endpoint === 'profile') await completeProfile(context, db);
    await contractRule(context, `/me/page-bootstrap/${entry.endpoint}`, 'invalid');
    try {
      await visit(page, entry.route);
      await expect(page.getByRole('heading', { name: '暂时无法加载', exact: true })).toBeVisible();
      await info.attach('SSR-invalid-response', { body: await page.screenshot(), contentType: 'image/png' });
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
      await info.attach('SSR-recovered', { body: await page.screenshot(), contentType: 'image/png' });
    } finally { await contractRule(context, `/me/page-bootstrap/${entry.endpoint}`, 'off'); }
  });
}

test('private JSON retains fields, ISO dates, null and distinct account ownership', async ({ context, db, account, signedIn }, info) => {
  void signedIn;
  const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  await db.userProfile.create({ data: { userId: account.id, headline: 'Synthetic contract headline' } });
  await db.vipActivation.create({ data: { codeHash: randomUUID(), batch: 'contract', userId: account.id, activatedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000) } });
  const second = await db.user.create({ data: { email: `${randomUUID()}@school.example.test`, passwordHash: user.passwordHash, displayName: '另一个合成账号', status: 'ACTIVE', schoolId: user.schoolId, acceptedTermsAt: new Date() } });
  const other = await context.browser()!.newContext();
  try {
    expect((await other.request.post(`${api}/auth/login`, { data: { email: second.email, password } })).ok()).toBeTruthy();
    const summary = [];
    for (const path of privatePaths) {
      const response = await context.request.get(`${api}${path}`);
      expect(response.status()).toBe(200);
      const value = await response.json();
      const separate = await (await other.request.get(`${api}${path}`)).json();
      if (path.includes('bootstrap')) {
        expect(value.user.id).toBe(account.id);
        expect(separate.user.id).toBe(second.id);
      }
      if (path.includes('page-bootstrap')) expect(response.headers()['cache-control']).toBe('private, no-store');
      if (path === '/me/dashboard' || path === '/me/bootstrap' || path.endsWith('/home')) {
        const dashboard = path === '/me/dashboard' ? value : value.dashboard;
        expect(Object.keys(dashboard).sort()).toEqual(['profile', 'questionnaireSubmittedAt', 'currentCycle', 'lastRevealedRound', 'latestMatch', 'latestMatchVisibility', 'latestMatchLimitedReason', 'recentMatchHistory', 'couponAgenda'].sort());
        expect(dashboard).not.toHaveProperty('user');
        expect(dashboard.profile.userId).toBe(account.id);
        for (const key of ['createdAt', 'updatedAt']) expect(new Date(dashboard.profile[key]).toISOString()).toBe(dashboard.profile[key]);
        expect(dashboard.couponAgenda).toMatchObject({ href: '/dashboard/coupons', readAt: null });
      }
      if (path.endsWith('/home')) expect(value).not.toHaveProperty('questionnaire');
      if (path.endsWith('/profile')) {
        expect(value.savedQuestionnaire).toBeNull();
        expect(Object.keys(value.dashboard)).toEqual(['questionnaireSubmittedAt']);
      }
      if (path.endsWith('/profile') || path.endsWith('/center')) {
        expect(new Date(value.vip.activatedAt).toISOString()).toBe(value.vip.activatedAt);
        expect(new Date(value.vip.expiresAt).toISOString()).toBe(value.vip.expiresAt);
        expect(separate.vip.activatedAt).toBeNull();
      }
      if (path.includes('contact-preferences')) {
        expect(value).toEqual({ email: account.email, revision: 0, preferredContactChannel: 'EMAIL', methods: [] });
        expect(separate.email).toBe(second.email);
      }
      summary.push({ path, status: response.status(), keys: Object.keys(value).sort(), privateNoStore: response.headers()['cache-control'] === 'private, no-store' });
    }
    await info.attach('private-contract-field-matrix', { body: JSON.stringify(summary, null, 2), contentType: 'application/json' });
  } finally { await other.close(); }
});

test('admin, merchant, absent and invalid sessions cannot substitute for user identity', async ({ browser, db, account }) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `admin-${account.email}`, passwordHash: user.passwordHash, displayName: '合成管理员' } });
  const merchant = await db.merchant.create({ data: { name: '合成商家' } });
  const operator = await db.merchantUser.create({ data: { email: `merchant-${account.email}`, passwordHash: user.passwordHash, merchantId: merchant.id, role: 'OWNER' } });
  for (const kind of ['absent', 'invalid', 'admin', 'merchant']) {
    const isolated = await browser.newContext();
    try {
      if (kind === 'invalid') await isolated.addCookies([{ name: 'lilink_token', value: 'invalid-synthetic-session', url: process.env.E2E_WEB_URL! }]);
      if (kind === 'admin') expect((await isolated.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBeTruthy();
      if (kind === 'merchant') expect((await isolated.request.post(`${api}/merchant/auth/login`, { data: { email: operator.email, password } })).ok()).toBeTruthy();
      for (const path of privatePaths) expect((await isolated.request.get(`${api}${path}`)).status(), `${kind} ${path}`).toBe(401);
    } finally { await isolated.close(); }
  }
});

test('invalid contact save response keeps draft and can retry with server revision', async ({ page, context, db, signedIn }, info) => {
  void signedIn;
  await completeProfile(context, db);
  await visit(page, '/dashboard/profile');
  await page.getByRole('button', { name: '下一题 →', exact: true }).click();
  await page.getByRole('button', { name: '下一题 →', exact: true }).click();
  await page.route('**/v1/me/contact-preferences', async route => {
    const response = await route.fetch();
    if (route.request().method() === 'PUT') await route.fulfill({ response, json: { ...(await response.json()), revision: 'invalid' } });
    else await route.fulfill({ response });
  });
  await page.getByRole('radio', { name: '微信', exact: true }).check();
  const input = page.getByRole('textbox', { name: '微信内容', exact: true });
  await input.fill('synthetic_contract_contact');
  await expect(page.getByRole('button', { name: '重试保存', exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '服务返回的数据格式异常，请重试。' })).toBeVisible();
  await expect(input).toHaveValue('synthetic_contract_contact');
  await info.attach('contact-invalid-response', { body: await page.screenshot(), contentType: 'image/png' });
  await page.unroute('**/v1/me/contact-preferences');
  await page.getByRole('button', { name: '重试保存', exact: true }).click();
  await expect(page.getByText('已自动保存 · 匹配成功后向对方展示', { exact: true })).toBeVisible();
  expect((await (await context.request.get(`${api}/me/contact-preferences`)).json()).revision).toBe(2);
});

test('browser refresh rejects invalid bootstrap, then accepts compatible fields on retry', async ({ page, context, db, signedIn }, info) => {
  void signedIn;
  await completeProfile(context, db);
  await visit(page, '/dashboard/profile');
  await page.route('**/v1/me/page-bootstrap/home', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), contactPreferences: { revision: -1 } } });
  });
  const name = page.getByRole('textbox', { name: '昵称', exact: true });
  await name.fill('协议验收同学');
  await expect(page.getByRole('main').getByText('全部修改已保存', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '首页', exact: true }).first().click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('服务返回的数据格式异常，请重试。');
  await info.attach('browser-invalid-bootstrap', { body: await page.screenshot(), contentType: 'image/png' });
  await page.unroute('**/v1/me/page-bootstrap/home');
  await page.route('**/v1/me/page-bootstrap/home', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), futureField: true } });
  });
  await page.getByRole('button', { name: '重试加载最新资料', exact: true }).click();
  await expect(page.getByRole('main')).toContainText('协议验收同学');
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

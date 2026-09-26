import { test, expect, api, password, visit, completeProfile } from '../support/fixtures';

// Failure contracts: refresh must preserve usable schools; an obsolete admin
// query must never replace the latest filter; independent charts fail locally.
test('school refresh keeps existing search and results usable', async ({ page }, testInfo) => {
  await visit(page, '/register/school');
  await page.getByLabel('学校邮箱', { exact: true }).fill('refresh@school.example.test');
  await expect(page.getByRole('status').filter({ hasText: '✓' })).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/public/schools', async route => {
    await gate;
    await route.fulfill({ status: 503, json: { message: 'Synthetic refresh failure' } });
  });
  try {
    await page.getByRole('button', { name: '查看支持的学校' }).click();
    const search = page.getByRole('searchbox', { name: '搜索学校或邮箱后缀' });
    await expect(search).toBeEnabled();
    await search.fill('school.example.test');
    await expect(page.getByRole('dialog').getByText('@school.example.test', { exact: true })).toBeVisible();
    release();
    await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
    await expect(search).toHaveValue('school.example.test');
    await expect(page.getByRole('dialog').getByText('@school.example.test', { exact: true })).toBeVisible();
    await testInfo.attach('schools-refresh-failed', { body: await page.screenshot(), contentType: 'image/png' });
  } finally { release(); }
});

test('admin refresh preserves controls and late queries cannot replace new results', async ({ page, account, context, db }, testInfo) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `refresh-${account.email}`, passwordHash: user.passwordHash, displayName: '刷新验收管理员' } });
  expect((await context.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBeTruthy();
  await visit(page, '/admin/schools');
  const search = page.getByPlaceholder('搜索学校名称、slug 或邮箱域名…');
  await expect(search).toBeVisible();
  await expect(page.getByText('正在加载列表…', { exact: true })).toHaveCount(0);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  let obsoleteFinished!: () => void;
  const obsoleteHandled = new Promise<void>(resolve => { obsoleteFinished = resolve; });
  await page.route(`${api}/admin/schools?*`, async route => {
    const requestNumber = ++calls;
    if (requestNumber === 1) await gate;
    try {
      await route.fulfill({ json: { items: [], total: requestNumber === 1 ? 91 : 0, page: 1, pageSize: 20, totalPages: 1 } });
    } finally { if (requestNumber === 1) obsoleteFinished(); }
  });
  try {
    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await expect.poll(() => calls).toBe(1);
    await expect(search).toBeVisible();
    await search.fill('latest-query');
    await search.press('Enter');
    await expect.poll(() => calls).toBeGreaterThan(1);
    await expect(page.getByText('正在更新列表…', { exact: true })).toHaveCount(0);
    release();
    await obsoleteHandled;
    await expect(search).toHaveValue('latest-query');
    await expect(page.getByText('91', { exact: true })).toHaveCount(0);
    await testInfo.attach('admin-latest-query', { body: await page.screenshot(), contentType: 'image/png' });
  } finally { release(); }
});

test('cycle statistics keep successful charts when the independent trend fails', async ({ page, account, context, db }, testInfo) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `charts-${account.email}`, passwordHash: user.passwordHash, displayName: '图表验收管理员' } });
  expect((await context.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBeTruthy();
  await page.route('**/admin/analytics/weekly-optin?*', route => route.fulfill({ status: 503, json: { message: '趋势暂不可用' } }));
  await visit(page, '/admin/cycles');
  await expect(page.getByRole('img', { name: /问卷完成率|本轮暂无报名/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: '本轮学校与性别' })).toBeVisible();
  await expect(page.getByRole('button', { name: '重试报名趋势' })).toBeVisible();
  await page.unroute('**/admin/analytics/weekly-optin?*');
  await page.getByRole('button', { name: '重试报名趋势' }).click();
  await expect(page.getByRole('heading', { name: '最近轮次报名趋势' })).toBeVisible();
  await expect(page.getByRole('button', { name: '重试报名趋势' })).toHaveCount(0);
  await testInfo.attach('independent-statistics', { body: await page.screenshot(), contentType: 'image/png' });
});


test('profile pauses hidden VIP polling and ignores the cancelled response after resume', async ({ page, signedIn, account, context, db }) => {
  void signedIn;
  await completeProfile(context, db);
  await db.vipActivation.create({ data: { codeHash: `polling-${account.id}`, userId: account.id, activatedAt: new Date(), expiresAt: new Date(Date.now() + 3600_000), batch: 'e2e-polling' } });
  await page.clock.install();
  await visit(page, '/dashboard/profile');
  await expect(page.getByText('全部修改已保存', { exact: true }).filter({ visible: true })).toBeVisible();
  const directory = page.getByRole('button', { name: '题目目录', exact: true });
  if (await directory.isVisible()) await directory.click();
  await page.getByRole('button', { name: /第 \d+ 题：希望对方的身高范围$/ }).filter({ visible: true }).click();
  const enabled = page.getByRole('main').getByText('高级筛选 · VIP 已启用', { exact: true }).filter({ visible: true });
  await expect(enabled).toBeVisible();
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/v1/me/vip', async route => {
    const number = ++calls;
    if (number === 1) {
      await gate;
      await route.fulfill({ status: 401, json: { message: 'Obsolete session response' } });
    } else await route.continue();
  });
  try {
    await page.evaluate(() => { for (let n = 0; n < 10; n++) window.dispatchEvent(new Event('focus')); });
    await expect.poll(() => calls).toBe(1);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.runFor(31_000);
    expect(calls).toBe(1);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => calls).toBe(2);
    release();
    await expect(enabled).toBeVisible();
    await expect(page.getByRole('main').getByText('高级筛选 · 需要 VIP，开通后可设置', { exact: true }).filter({ visible: true })).toHaveCount(0);
  } finally { release(); }
});

test('first school read times out and manual retry recovers', async ({ page }, info) => {
  await page.clock.install();
  let release!: () => void;
  const stalled = new Promise<void>(resolve => { release = resolve; });
  let attempts = 0;
  await page.route('**/api/public/schools', async route => {
    if (++attempts === 1) { await stalled; await route.abort(); }
    else await route.continue();
  });
  try {
    await visit(page, '/register/school');
    await page.getByLabel('学校邮箱', { exact: true }).fill('deadline@school.example.test');
    await expect.poll(() => attempts).toBe(1);
    await page.clock.fastForward(15_100);
    await expect(page.getByText('暂时无法核对邮箱后缀', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '重试加载学校列表', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '✓' })).toBeVisible();
    expect(attempts).toBe(2);
    await info.attach('schools-timeout-recovery', { body: await page.screenshot(), contentType: 'image/png' });
  } finally { release(); }
});

test('stalled match estimate times out and focus can start a fresh read', async ({ page, signedIn, account, context, db }, info) => {
  void signedIn;
  await completeProfile(context, db);
  await db.vipActivation.create({ data: { codeHash: `estimate-${account.id}`, userId: account.id,
    activatedAt: new Date(), expiresAt: new Date(Date.now() + 3600_000), batch: 'e2e-estimate' } });
  await page.clock.install();
  let release!: () => void;
  const stalled = new Promise<void>(resolve => { release = resolve; });
  let attempts = 0;
  let cancelled = false;
  page.on('requestfailed', request => { if (request.url().endsWith('/me/match-estimate')) cancelled = true; });
  await page.route('**/v1/me/match-estimate', async route => {
    if (++attempts === 1) { await stalled; await route.abort(); }
    else await route.fulfill({ json: { available: true, band: 'HIGH', lowConfidence: false } });
  });
  try {
    await visit(page, '/dashboard/profile');
    await expect(page.getByText('全部修改已保存', { exact: true }).filter({ visible: true })).toBeVisible();
    await page.clock.runFor(500);
    await expect.poll(() => attempts).toBe(1);
    await page.clock.fastForward(15_100);
    await expect.poll(() => cancelled).toBeTruthy();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.clock.runFor(500);
    await expect.poll(() => attempts).toBe(2);
    await expect(page.getByText('排除后匹配到的概率：', { exact: true })).toHaveCount(1);
    await info.attach('estimate-timeout-recovery', { contentType: 'application/json', body: JSON.stringify({
      attempts, cancelled, recoveredEstimate: true, browserProject: info.project.name,
    }) });
  } finally { release(); }
});

import { test, expect, api, password, visit } from '../support/fixtures';

// Behavioral boundaries: artwork/JavaScript cannot hide public copy; offscreen
// marks load on approach; a private SSR list is reused until explicit refresh.
for (const failure of ['stalled', 'failed'] as const) {
  test(`one-to-one copy and registration survive ${failure} artwork @smoke @mobile @webkit`, async ({ page }, info) => {
    let release!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/images/responsive/one-to-one-*', async route => {
      if (failure === 'stalled') await hold;
      await route.abort();
    });
    try {
      await page.goto('/one-to-one', { waitUntil: 'domcontentloaded' });
      await expect(page.getByRole('heading', { name: /先双向心动/ })).toBeVisible();
      await page.getByRole('button', { name: '填写登记表', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await info.attach('copy-visible-without-artwork', { body: JSON.stringify({ failure, viewport: page.viewportSize(), headingVisible: true, registrationDialogVisible: true }), contentType: 'application/json' });
    } finally { release(); }
  });
}

test('one-to-one server copy survives disabled JavaScript @smoke @mobile @webkit', async ({ browser, baseURL }, info) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await visit(page, '/one-to-one');
    await expect(page.getByRole('heading', { name: /先双向心动/ })).toBeVisible();
    await info.attach('server-copy-without-js', { body: JSON.stringify({ headingVisible: true }), contentType: 'application/json' });
  } finally { await context.close(); }
});

test('first-screen school marks load before stalled application scripts @smoke @mobile @webkit', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/_next/static/**/*.js', async route => { await held; await route.continue(); });
  try {
    await page.goto('/schools', { waitUntil: 'commit' });
    await expect(page.getByRole('heading', { name: /来自不同的大学/ })).toBeVisible();
    await expect.poll(() => page.locator('[data-school-logo]').evaluateAll(elements => elements.filter(el => {
      const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight;
    }).filter(el => { const image = el.querySelector('img'); return image?.complete && image.naturalWidth > 0 && image.currentSrc.includes('/images/school-atlases/'); }).length)).toBe(5);
    await info.attach('school-marks-without-hydration', { body: JSON.stringify({ visibleDecodedMarks: 5, appScriptsHeld: true }), contentType: 'application/json' });
  } finally { release(); }
});

test('school marks download only near their rows and all survive scrolling @smoke @mobile @webkit', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests = new Set<string>();
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.includes('/images/school-atlases/')) requests.add(path);
  });
  await visit(page, '/schools');
  const marks = page.locator('[data-school-logo]');
  await expect(marks).toHaveCount(28);
  await expect.poll(() => marks.evaluateAll(elements => elements.filter(element => {
    const box = element.getBoundingClientRect();
    return box.top < innerHeight && box.bottom > 0;
  }).every(element => { const image = element.querySelector('img'); return image?.complete && image.naturalWidth > 0 && image.currentSrc.includes('/images/school-atlases/'); }))).toBe(true);
  // A finite idle window detects native lazy loading's overly generous threshold.
  await page.waitForTimeout(1200);
  const initial = [...requests];
  expect(initial.length).toBeLessThanOrEqual(2);
  expect(initial.every(path => /partners-[12]-/.test(path))).toBe(true);
  for (const mark of await marks.all()) {
    await mark.scrollIntoViewIfNeeded();
    await expect.poll(() => mark.locator('img').evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0 && (image as HTMLImageElement).currentSrc.includes('/images/school-atlases/'))).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await info.attach('school-loading-ledger', { body: JSON.stringify({ initial, afterScroll: [...requests], logos: 28 }), contentType: 'application/json' });
});

test('cycles SSR supplies a private list without a duplicate browser fetch @smoke @mobile @webkit', async ({ page, context, request, db, account }, info) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `loading-${account.email}`, passwordHash: user.passwordHash, displayName: '加载验收管理员' } });
  expect((await context.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBe(true);
  const cycle = await db.matchCycle.create({ data: { codename: `加载验收-${account.id}`, status: 'DRAFT', participationDeadline: new Date(Date.now() + 86400000), revealAt: new Date(Date.now() + 172800000) } });
  const reads: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === new URL(api).origin && url.pathname === '/v1/admin/cycles' && request.method() === 'GET') reads.push(url.search);
  });
  const response = await page.goto('/admin/cycles');
  expect(response!.headers()['cache-control']).toContain('no-store');
  expect(await response!.text()).toContain(cycle.codename);
  await expect(page.getByRole('heading', { name: '轮次中心', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(cycle.codename) })).toBeVisible();
  await page.waitForTimeout(1000);
  expect(reads).toHaveLength(0);
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect.poll(() => reads.length).toBe(1);
  await page.getByPlaceholder('搜索轮次名称或备注').fill('不存在的验收轮次');
  await page.getByPlaceholder('搜索轮次名称或备注').press('Enter');
  await expect(page.getByText('没有找到匹配的轮次。', { exact: true })).toBeVisible();
  await info.attach('cycles-read-ledger', { body: JSON.stringify({ initialBrowserReads: 0, explicitRefreshReads: 1, reads }), contentType: 'application/json' });
  const anonymous = await request.get('/admin/cycles');
  expect(await anonymous.text()).not.toContain(cycle.codename);
});

test('primary navigation waits for intent and still reaches its destination @smoke @mobile @webkit', async ({ page, signedIn }, info) => {
  void signedIn;
  const prefetched: string[] = [];
  page.on('request', request => {
    if (request.headers()['next-router-prefetch'] === '1') prefetched.push(new URL(request.url()).pathname);
  });
  await visit(page, '/dashboard');
  await expect(page.getByRole('main')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(prefetched.filter(path => path.startsWith('/dashboard/'))).toEqual([]);
  const link = page.locator('a[href="/dashboard/profile"]').filter({ visible: true }).first();
  await link.focus();
  await expect.poll(() => prefetched.includes('/dashboard/profile')).toBe(true);
  await link.press('Enter');
  await expect(page).toHaveURL(/\/dashboard\/profile$/);
  await expect(page.getByRole('main')).toContainText('我的资料');
  await info.attach('primary-navigation-ledger', { body: JSON.stringify({ prefetched, destinationVisible: true }), contentType: 'application/json' });
});

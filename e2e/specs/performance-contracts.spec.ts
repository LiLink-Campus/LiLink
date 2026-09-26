import { test, expect, api, completeProfile, visit } from '../support/fixtures';

test.beforeEach(async ({ signedIn }) => { void signedIn; });

test('coupon overview is bounded and historical pagination has no duplicates', async ({ page, context, db, account }) => {
  const campaign = await db.campaign.create({ data: { name: 'Synthetic history', slug: `history-${account.id}` } });
  const merchant = await db.merchant.create({ data: { name: 'Synthetic merchant' } });
  for (let i = 0; i < 24; i++) {
    const template = await db.couponTemplate.create({ data: { campaignId: campaign.id, merchantId: merchant.id, title: `历史券 ${i}`, benefitType: 'CUSTOM', faceValue: 500 } });
    await db.coupon.create({ data: { userId: account.id, templateId: template.id, code: `${account.id}-${i}`, status: i === 23 ? 'ISSUED' : 'EXPIRED', issuedAt: new Date('2026-01-01T00:00:00Z') } });
  }
  const first = await (await context.request.get(`${api}/me/coupons/overview`)).json();
  expect(first.available.items).toHaveLength(1);
  expect(first.history.items).toHaveLength(20);
  expect(first.history.nextCursor).toBeTruthy();
  const second = await (await context.request.get(`${api}/me/coupons/page?status=history&cursor=${encodeURIComponent(first.history.nextCursor)}`)).json();
  expect(second.items).toHaveLength(3);
  expect(second.nextCursor).toBeNull();
  expect(new Set([...first.history.items, ...second.items].map(item => item.id)).size).toBe(23);
  expect((await context.request.get(`${api}/me/coupons/page?status=history&cursor=invalid`)).status()).toBe(400);
  await visit(page, '/dashboard/coupons');
  await expect(page.getByRole('main').getByRole('heading', { name: '我的优惠券' })).toBeVisible();
  await page.getByRole('button', { name: '加载更多历史优惠券' }).click();
  await expect(page.getByRole('region', { name: '历史记录' }).getByRole('article')).toHaveCount(23);
});

test('home summary retains eligibility and account isolation without full questionnaire data', async ({ page, context, db, account }, info) => {
  const before = await context.request.get(`${api}/me/page-bootstrap/home`);
  expect(before.ok()).toBeTruthy();
  const incomplete = await before.json();
  expect(incomplete.user.id).toBe(account.id);
  expect(incomplete.questionnaireProgress.eligibleToOptIn).toBe(false);
  expect(incomplete.questionnaire).toBeUndefined();
  expect(incomplete.savedQuestionnaire).toBeUndefined();
  await completeProfile(context, db);
  const response = await context.request.get(`${api}/me/page-bootstrap/home`);
  expect(response.headers()['cache-control']).toContain('no-store');
  const complete = await response.json();
  expect(complete.questionnaireProgress).toMatchObject({ percent: 100, submitted: true, eligibleToOptIn: true, hasIncompleteDraft: false });
  expect(complete.contactPreferences).toBeTruthy();
  const profile = await (await context.request.get(`${api}/me/page-bootstrap/profile`)).json();
  const previousShape = { user: complete.user, dashboard: complete.dashboard, questionnaire: profile.questionnaire,
    savedQuestionnaire: profile.savedQuestionnaire, contactPreferences: complete.contactPreferences };
  const currentBytes = Buffer.byteLength(JSON.stringify(complete));
  const previousShapeBytes = Buffer.byteLength(JSON.stringify(previousShape));
  expect(currentBytes).toBeLessThan(previousShapeBytes);
  await info.attach('home-read-model-bytes', { body: JSON.stringify({ currentBytes, previousShapeBytes,
    fixture: 'synthetic completed questionnaire', comparison: 'same current data in previous aggregate response shape',
    includesBrowserTransfer: false }), contentType: 'application/json' });
  await visit(page, '/dashboard');
  await expect(page.getByRole('main')).toContainText('自动化同学');
  await context.clearCookies();
  expect((await context.request.get(`${api}/me/page-bootstrap/home`)).status()).toBe(401);
});

test('profile keeps verified VIP state through transient reads and expiry remains authoritative', async ({ page, context, db, account }) => {
  await completeProfile(context, db);
  await db.vipActivation.create({ data: { codeHash: `performance-${account.id}`, userId: account.id, activatedAt: new Date(Date.now() - 86_400_000), expiresAt: new Date(Date.now() + 60_000), batch: 'e2e-performance' } });
  await visit(page, '/dashboard/profile');
  await expect(page.getByText('全部修改已保存', { exact: true }).filter({ visible: true })).toBeVisible();
  const activeBenefits = page.getByText('高级筛选 · VIP 已启用', { exact: true });
  await expect(activeBenefits).not.toHaveCount(0);
  let requests = 0;
  await page.route('**/v1/me/vip', async route => {
    requests++;
    await route.fulfill({ status: 503, json: { message: 'Temporary outage' } });
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => requests).toBe(1);
  await expect(page.getByText('权益状态暂时无法更新，稍后会自动重试。')).toBeVisible();
  await expect(activeBenefits).not.toHaveCount(0);
  await db.vipActivation.updateMany({ where: { userId: account.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await page.unroute('**/v1/me/vip');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('权益状态暂时无法更新，稍后会自动重试。')).toHaveCount(0);
  await expect(activeBenefits).toHaveCount(0);
  expect((await (await context.request.get(`${api}/me/vip`)).json()).active).toBe(false);
});

test('coupon dialog serializes polling and ignores an old coupon response after switching', async ({ page, db, account }) => {
  const campaign = await db.campaign.create({ data: { name: 'Synthetic polling', slug: `polling-${account.id}` } });
  const merchant = await db.merchant.create({ data: { name: 'Synthetic polling merchant' } });
  const coupons = [];
  for (let index = 0; index < 2; index++) {
    const template = await db.couponTemplate.create({ data: { campaignId: campaign.id, merchantId: merchant.id, title: `轮询券 ${index}`, benefitType: 'CUSTOM', faceValue: 500 } });
    coupons.push(await db.coupon.create({ data: { userId: account.id, templateId: template.id, code: `${account.id}-poll-${index}`, status: 'ISSUED' } }));
  }
  await page.route('**/redeem-secret', route => route.fulfill({ json: { code: 'ABCD2345', secret: 'JBSWY3DPEHPK3PXP', period: 60, digits: 6 } }));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route(`**/me/coupons/${coupons[0].id}/status`, async route => {
    requests++;
    await gate;
    await route.fulfill({ json: { status: 'REDEEMED', redeemedAt: new Date().toISOString() } });
  });
  await page.clock.install();
  await visit(page, '/dashboard/coupons');
  await page.getByRole('article', { name: '轮询券 0', exact: true }).getByRole('button').click();
  await expect(page.getByRole('dialog').getByText('请向店员出示此核销码')).toBeVisible();
  try {
    await page.clock.runFor(2600);
    await expect.poll(() => requests).toBe(1);
    await page.clock.runFor(5000);
    expect(requests).toBe(1);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.runFor(5000);
    expect(requests).toBe(1);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.runFor(2600);
    await expect.poll(() => requests).toBe(2);
    await page.getByRole('dialog').getByRole('button', { name: '完成' }).click();
    await page.getByRole('article', { name: '轮询券 1', exact: true }).getByRole('button').click();
    await expect(page.getByRole('dialog').getByText('请向店员出示此核销码')).toBeVisible();
    release();
    await expect(page.getByRole('dialog')).toHaveAccessibleName('轮询券 1');
    await expect(page.getByRole('dialog').getByText('核销成功', { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('lilink:coupon-secret:')))).toEqual([]);
  } finally { release(); }
});

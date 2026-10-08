import { test, expect, api, visit } from '../support/fixtures';
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

for (const entry of [{ status: 401, action: 'refresh' }, { status: 403, action: 'page' }] as const) {
  test(`coupon ${entry.action} removes private cards and an open code after ${entry.status}`, async ({ page, db, account, signedIn }, info) => {
    void signedIn;
    const campaign = await db.campaign.create({ data: { name: 'Private read fixture', slug: `private-${account.id}` } });
    const merchant = await db.merchant.create({ data: { name: 'Private fixture merchant' } });
    for (let index = 0; index < 22; index++) {
      const template = await db.couponTemplate.create({ data: {
        campaignId: campaign.id, merchantId: merchant.id, title: `私有验收券 ${index}`, benefitType: 'CUSTOM', faceValue: 100,
      } });
      await db.coupon.create({ data: {
        userId: account.id, templateId: template.id, code: `${account.id}-${index}`,
        status: index === 0 ? 'ISSUED' : 'EXPIRED', totpSecret: 'JBSWY3DPEHPK3PXP',
      } });
    }
    await visit(page, '/dashboard/coupons');
    await expect(page.getByRole('article')).toHaveCount(21);
    if (entry.action === 'refresh') {
      await page.route('**/me/coupons/overview', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic temporary failure' }) }));
      await page.getByRole('button', { name: '刷新优惠券', exact: true }).click();
      await expect(page.getByRole('main').getByRole('alert')).toContainText('Synthetic temporary failure');
      await expect(page.getByRole('article')).toHaveCount(21);
      await page.unroute('**/me/coupons/overview');
    }
    let release!: () => void;
    const delayed = new Promise<void>(resolve => { release = resolve; });
    let requested!: () => void;
    const started = new Promise<void>(resolve => { requested = resolve; });
    await page.route(entry.action === 'refresh' ? '**/me/coupons/overview' : '**/me/coupons/page?**', async route => {
      requested();
      await delayed;
      await route.fulfill({ status: entry.status, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic authorization expired' }) });
    });
    await page.getByRole('button', { name: entry.action === 'refresh' ? '刷新优惠券' : '加载更多历史优惠券', exact: true }).click();
    await started;
    try {
      await page.getByRole('button', { name: '查看核销码', exact: true }).click();
      await expect(page.getByText('请向店员出示此核销码', { exact: true })).toBeVisible();
    } finally { release(); }
    await expect(page.getByRole('article')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('link', { name: '重新登录', exact: true })).toBeVisible();

  });
}

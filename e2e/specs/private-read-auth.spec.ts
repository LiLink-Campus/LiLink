import { test, expect, api, password, visit } from '../support/fixtures';

test('expired admin refresh removes the previous private list', async ({ page, account, context, db }) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `expiry-${account.email}`, passwordHash: user.passwordHash, displayName: '会话验收管理员' } });
  expect((await context.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBeTruthy();
  await visit(page, '/admin/schools');
  await expect(page.getByText('自动化测试大学', { exact: true })).toBeVisible();
  await context.clearCookies();
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.getByText('自动化测试大学', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '进入后台', exact: true })).toBeVisible();
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
    await info.attach('coupons-reauthentication', { body: await page.screenshot(), contentType: 'image/png' });
  });
}

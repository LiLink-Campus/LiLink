import { test, expect, api, visit, vipCode } from '../support/fixtures';

test.beforeEach(async ({ signedIn }) => { void signedIn; });

test('VIP activation is persistent and repeated redemption is idempotent @smoke', async ({ page, db }) => {
  const code = await vipCode(db);
  await visit(page, '/dashboard/vip');
  await page.getByLabel('VIP 激活码', { exact: true }).fill(code);
  await page.getByRole('button', { name: '确认激活 30 天 VIP', exact: true }).click();
  await expect(page.getByRole('main').getByText('激活成功', { exact: false })).toBeVisible();
  const first = await (await page.request.get(`${api}/me/vip`)).json();
  expect(first.active).toBe(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByLabel('VIP 激活码', { exact: true }).fill(code);
  await page.getByRole('button', { name: '确认激活 30 天 VIP', exact: true }).click();
  await expect(page.getByRole('main').getByText('激活成功', { exact: false })).toBeVisible();
  const second = await (await page.request.get(`${api}/me/vip`)).json();
  expect(second.expiresAt).toBe(first.expiresAt);
  await visit(page, '/dashboard/me');
  await expect(page.getByRole('main').getByText('已开通', { exact: true })).toBeVisible();
});

test('expired VIP loses benefits on reload', async ({ page, db, account }) => {
  const grant = await db.vipActivation.create({ data: {
    codeHash: `expiry-${account.id}`, batch: 'e2e', userId: account.id,
    activatedAt: new Date(Date.now() - 86_400_000), expiresAt: new Date(Date.now() + 86_400_000),
  } });
  await visit(page, '/dashboard/me');
  await expect(page.getByRole('main').getByText('已开通', { exact: true })).toBeVisible();
  await db.vipActivation.update({ where: { id: grant.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('main').getByText('已到期', { exact: true })).toBeVisible();
  expect((await (await page.request.get(`${api}/me/vip`)).json()).active).toBe(false);
});

test('invalid activation code shows error without enabling VIP', async ({ page }) => {
  await visit(page, '/dashboard/vip');
  await page.getByLabel('VIP 激活码', { exact: true }).fill('Z'.repeat(24));
  await page.getByRole('button', { name: '确认激活 30 天 VIP', exact: true }).click();
  await expect(page.getByRole('main').getByText('激活码无效或已停用', { exact: false })).toBeVisible();
  expect((await (await page.request.get(`${api}/me/vip`)).json()).active).toBe(false);
});

test('activation rate limit remains enforced for one client', async ({ context, account }) => {
  void account;
  for (let index = 0; index < 5; index++) {
    const response = await context.request.post(`${api}/me/vip/activate`, { data: { code: 'Z'.repeat(24) } });
    expect(response.status()).toBe(400);
  }
  const response = await context.request.post(`${api}/me/vip/activate`, { data: { code: 'Z'.repeat(24) } });
  expect(response.status()).toBe(429);
});

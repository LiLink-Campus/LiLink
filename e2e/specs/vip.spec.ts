import { createHash, randomUUID } from 'node:crypto';
import { test, expect, api, visit, vipCode } from '../support/fixtures';

test.beforeEach(async ({ signedIn }) => { void signedIn; });

test('VIP activation is persistent and repeated redemption is idempotent @smoke', async ({ page, db }, info) => {
  const code = await vipCode(db);
  await visit(page, '/dashboard/vip');
  await page.getByLabel('VIP 激活码', { exact: true }).fill(code);
  await page.getByRole('button', { name: '确认激活 30 天 VIP', exact: true }).click();
  const firstDialog = page.getByRole('dialog', { name: 'VIP 开通成功' });
  await expect(firstDialog).toBeVisible();
  await expect(firstDialog.getByRole('button', { name: '知道了' })).toBeFocused();
  const first = await (await page.request.get(`${api}/me/vip`)).json();
  expect(first.active).toBe(true);
  await expect(firstDialog.locator('time')).toHaveAttribute('datetime', first.expiresAt);
  await info.attach('activation-dialog', { body: await page.screenshot(), contentType: 'image/png' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByLabel('VIP 激活码', { exact: true }).fill(code);
  await page.getByRole('button', { name: '确认激活 30 天 VIP', exact: true }).click();
  const repeated = page.getByRole('dialog', { name: '此激活码已兑换' });
  await expect(repeated).toBeVisible();
  await expect(repeated).toContainText('本次未增加会员时长');
  await repeated.getByRole('button', { name: '知道了' }).click();
  await expect(page.getByRole('button', { name: '确认激活 30 天 VIP' })).toBeFocused();
  const second = await (await page.request.get(`${api}/me/vip`)).json();
  expect(second.expiresAt).toBe(first.expiresAt);
  await visit(page, '/dashboard/me');
  await expect(page.getByRole('main').getByText('已开通', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '账号信息' }).getByLabel('VIP 会员', { exact: true })).toBeVisible();
  await info.attach('active-account', { body: await page.screenshot(), contentType: 'image/png' });
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
  await expect(page.getByRole('region', { name: '账号信息' }).getByLabel('VIP 会员', { exact: true })).toHaveCount(0);
  expect((await (await page.request.get(`${api}/me/vip`)).json()).active).toBe(false);
});

test('invalid activation code shows error without enabling VIP', async ({ page }) => {
  await visit(page, '/dashboard/vip');
  await page.getByLabel('VIP 激活码', { exact: true }).fill('Z'.repeat(24));
  await page.getByRole('button', { name: '确认激活 30 天 VIP', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '激活未完成' })).toContainText('激活码无效或已停用');
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

test('renewal and reactivation show the authoritative expiry @smoke', async ({ page, db, account }, info) => {
  const initialExpiry = new Date(Date.now() + 10 * 86_400_000);
  const original = await db.vipActivation.create({ data: {
    codeHash: `renewal-${account.id}`, batch: 'e2e', userId: account.id,
    activatedAt: new Date(Date.now() - 20 * 86_400_000), expiresAt: initialExpiry,
  } });
  await visit(page, '/dashboard/vip');
  await page.getByLabel('VIP 激活码', { exact: true }).fill(await vipCode(db));
  await page.getByRole('button', { name: '确认激活 30 天 VIP' }).click();
  const renewed = page.getByRole('dialog', { name: 'VIP 续费成功' });
  await expect(renewed).toBeVisible();
  await expect(renewed.locator('time')).toHaveAttribute('datetime', new Date(initialExpiry.getTime() + 30 * 86_400_000).toISOString());
  await expect(renewed).toContainText('原到期时间');
  await info.attach('renewal-dialog', { body: await page.screenshot(), contentType: 'image/png' });
  await renewed.getByRole('button', { name: '知道了' }).click();
  await db.vipActivation.updateMany({ where: { userId: account.id }, data: { activatedAt: new Date(Date.now() - 31 * 86_400_000), expiresAt: new Date(Date.now() - 1000) } });
  // Keep the stale active page to ensure the server determines the outcome.
  const before = Date.now();
  await page.getByLabel('VIP 激活码', { exact: true }).fill(await vipCode(db));
  await page.getByRole('button', { name: '确认激活 30 天 VIP' }).click();
  const restarted = page.getByRole('dialog', { name: 'VIP 开通成功' });
  await expect(restarted).toBeVisible();
  const status = await (await page.request.get(`${api}/me/vip`)).json();
  expect(Date.parse(status.expiresAt)).toBeGreaterThanOrEqual(before + 30 * 86_400_000);
  await expect(restarted.locator('time')).toHaveAttribute('datetime', status.expiresAt);
  await info.attach('reactivation-dialog', { body: await page.screenshot(), contentType: 'image/png' });
  expect(await db.vipActivation.findUnique({ where: { id: original.id } })).not.toBeNull();
});

test('revoked and other-account codes show rejection dialogs', async ({ page, db }) => {
  const revoked = await vipCode(db);
  await db.vipActivation.update({ where: { codeHash: createHash('sha256').update(revoked).digest('hex') }, data: { revokedAt: new Date() } });
  const other = await db.user.create({ data: { email: `${randomUUID()}@example.invalid`, passwordHash: 'unusable-test-only', status: 'ACTIVE' } });
  const used = await vipCode(db);
  await db.vipActivation.update({ where: { codeHash: createHash('sha256').update(used).digest('hex') }, data: { userId: other.id, activatedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86_400_000) } });
  await visit(page, '/dashboard/vip');
  for (const [code, message] of [[revoked, '无效或已停用'], [used, '已被使用']]) {
    await page.getByLabel('VIP 激活码', { exact: true }).fill(code);
    await page.getByRole('button', { name: '确认激活 30 天 VIP' }).click();
    const dialog = page.getByRole('dialog', { name: '激活未完成' });
    await expect(dialog).toContainText(message);
    await dialog.getByRole('button', { name: '知道了' }).click();
    await expect(page.getByLabel('VIP 激活码', { exact: true })).toHaveValue(code);
  }
});

test('expired code retries and invalid input always open a dialog', async ({ page, db, account }) => {
  const code = await vipCode(db);
  await db.vipActivation.update({ where: { codeHash: createHash('sha256').update(code).digest('hex') }, data: { userId: account.id, activatedAt: new Date(Date.now() - 31 * 86_400_000), expiresAt: new Date(Date.now() - 86_400_000) } });
  await visit(page, '/dashboard/vip');
  const submit = page.getByRole('button', { name: '确认激活 30 天 VIP' });
  await page.getByLabel('VIP 激活码', { exact: true }).fill(code);
  await submit.click();
  const redeemed = page.getByRole('dialog', { name: '此激活码已兑换' });
  await expect(redeemed).toContainText('会员已到期');
  await page.keyboard.press('Escape');
  await expect(redeemed).not.toBeVisible();
  for (let attempt = 0; attempt < 2; attempt++) {
    await submit.click();
    const invalid = page.getByRole('dialog', { name: '请检查激活码' });
    await expect(invalid).toBeVisible();
    await invalid.getByRole('button', { name: '知道了' }).click();
    await expect(submit).toBeFocused();
  }
});

test('account cards align at desktop breakpoints and fit narrow screens', async ({ page, db, account }, info) => {
  await visit(page, '/dashboard/me');
  await expect(page.getByRole('region', { name: '账号信息' }).getByLabel('VIP 会员', { exact: true })).toHaveCount(0);
  await info.attach('free-account', { body: await page.screenshot(), contentType: 'image/png' });
  await db.vipActivation.create({ data: { codeHash: `layout-${account.id}`, batch: 'e2e', userId: account.id, activatedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86_400_000) } });
  await page.reload();
  await expect(page.getByRole('region', { name: '账号信息' }).getByLabel('VIP 会员', { exact: true })).toBeVisible();
  for (const width of [360, 390, 879, 880, 945, 1280]) {
    await page.setViewportSize({ width, height: 898 });
    const identity = await page.getByRole('region', { name: '账号信息' }).boundingBox();
    const vip = await page.getByRole('region', { name: 'VIP 与激活码' }).boundingBox();
    if (width >= 880) {
      expect(Math.abs(identity!.height - vip!.height)).toBeLessThan(1);
      expect(Math.abs(identity!.y - vip!.y)).toBeLessThan(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const badge = page.getByRole('region', { name: '账号信息' }).getByLabel('VIP 会员', { exact: true });
    expect(await badge.evaluate(el => getComputedStyle(el, '::after').animationName)).toBe('none');
    await info.attach(`account-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  }
});

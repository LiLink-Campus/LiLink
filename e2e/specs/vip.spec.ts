import { createHash, randomUUID } from 'node:crypto';
import { test, expect, api, visit, vipCode } from '../support/fixtures';

test.beforeEach(async ({ signedIn }) => { void signedIn; });

test('VIP activation is persistent and repeated redemption is idempotent @smoke', async ({ page, db }, info) => {
  const code = await vipCode(db);
  await visit(page, '/dashboard/vip');
  await page.getByRole('button', { name: '使用激活码', exact: true }).click();
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
  await page.getByRole('button', { name: '使用激活码', exact: true }).click();
  await page.getByLabel('VIP 激活码', { exact: true }).fill(code);
  await page.getByRole('button', { name: '确认激活 30 天 VIP', exact: true }).click();
  const repeated = page.getByRole('dialog', { name: '此激活码已兑换' });
  await expect(repeated).toBeVisible();
  await expect(repeated).toContainText('本次未增加会员时长');
  await repeated.getByRole('button', { name: '知道了' }).click();
  await expect(page.getByRole('button', { name: '使用激活码', exact: true })).toBeFocused();
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

test('advanced filters activation restores its opener and falls back after purchase @smoke', async ({ page, db }) => {
  await visit(page, '/dashboard/vip');
  const opener = page.getByRole('button', { name: '去开通', exact: true });
  await opener.click();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await opener.click();
  await page.getByRole('button', { name: '关闭激活弹窗' }).click();
  await expect(opener).toBeFocused();
  await opener.click();
  await page.getByLabel('VIP 激活码', { exact: true }).fill(await vipCode(db));
  await page.getByRole('button', { name: '确认激活 30 天 VIP' }).click();
  await page.getByRole('dialog', { name: 'VIP 开通成功' }).getByRole('button', { name: '知道了' }).click();
  await expect(page.getByRole('link', { name: '去设置' })).toBeVisible();
  await expect(page.getByRole('button', { name: '使用激活码', exact: true })).toBeFocused();
});

test('invalid activation code shows error without enabling VIP', async ({ page }) => {
  await visit(page, '/dashboard/vip');
  await page.getByRole('button', { name: '使用激活码', exact: true }).click();
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
  await page.getByRole('button', { name: '使用激活码', exact: true }).click();
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
  await page.getByRole('button', { name: '使用激活码', exact: true }).click();
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
  await page.getByRole('button', { name: '使用激活码', exact: true }).click();
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
  await page.getByRole('button', { name: '使用激活码', exact: true }).click();
  const submit = page.getByRole('button', { name: '确认激活 30 天 VIP' });
  await page.getByLabel('VIP 激活码', { exact: true }).fill(code);
  await submit.click();
  const redeemed = page.getByRole('dialog', { name: '此激活码已兑换' });
  await expect(redeemed).toContainText('会员已到期');
  await page.keyboard.press('Escape');
  await expect(redeemed).not.toBeVisible();
  await page.getByRole('button', { name: '使用激活码', exact: true }).click();
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
  for (const width of [320, 360, 390, 879, 880, 945, 1280]) {
    await page.setViewportSize({ width, height: 898 });
    const identity = await page.getByRole('region', { name: '账号信息' }).boundingBox();
    const vip = await page.getByRole('region', { name: 'LiLink VIP' }).boundingBox();
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


test('VIP page keeps details collapsed and activation centered @smoke', async ({ page }, info) => {
  await visit(page, '/dashboard/me');
  await page.getByRole('link', { name: '查看权益与激活' }).click();
  await expect(page).toHaveURL(/\/dashboard\/vip$/);
  await expect(page.getByRole('table', { name: '普通用户与 VIP 权益对比' })).not.toBeVisible();
  for (const width of [320, 390, 575, 879, 880, 1280]) {
    await page.setViewportSize({ width, height: 898 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const trigger = page.getByRole('button', { name: '使用激活码', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: '使用激活码', exact: true });
    await expect(page.getByLabel('VIP 激活码', { exact: true })).toBeFocused();
    const bounds = await dialog.boundingBox();
    expect(Math.abs(bounds!.x + bounds!.width / 2 - width / 2)).toBeLessThan(2);
    expect(Math.abs(bounds!.y + bounds!.height / 2 - 898 / 2)).toBeLessThan(2);
    await info.attach(`activation-modal-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await info.attach(`vip-page-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  }
  await page.getByText('VIP 与普通用户有什么区别？', { exact: true }).click();
  await expect(page.getByRole('table', { name: '普通用户与 VIP 权益对比' })).toBeVisible();
  await page.getByText('会员到期后会怎样？', { exact: true }).click();
  await expect(page.getByRole('table', { name: '普通用户与 VIP 权益对比' })).toBeVisible();
  await expect(page.getByText(/会员到期后，优先匹配与高级筛选将停止生效/)).toBeVisible();
  await page.getByText('重复激活如何计算？', { exact: true }).press('Enter');
  await expect(page.getByText(/每张新激活码增加 30 天；有效期内激活/)).toBeVisible();
  await expect(page.getByText(/会员到期后，优先匹配与高级筛选将停止生效/)).toBeVisible();
  const faq = page.getByRole('region', { name: '常见问题', exact: true });
  await expect(faq.locator('details[open]')).toHaveCount(3);
  await page.getByText('重复激活如何计算？', { exact: true }).press('Enter');
  await expect(faq.locator('details[open]')).toHaveCount(2);
  await expect(page.getByRole('table', { name: '普通用户与 VIP 权益对比' })).toBeVisible();
  await expect(page.getByText(/会员到期后，优先匹配与高级筛选将停止生效/)).toBeVisible();
  await info.attach('vip-expanded', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});

import { test, expect, api, password, visit } from '../support/fixtures';
import type { BrowserContext } from '@playwright/test';

async function loginAdmin(context: BrowserContext, db: any, accountId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: accountId } });
  const admin = await db.adminOperator.create({ data: { email: `weekly-admin-${user.email}`, passwordHash: user.passwordHash } });
  const response = await context.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test('@smoke admin enables weekly cycles, sees the new cycle, and pauses durably', async ({ page, context, db, account }, info) => {
  await loginAdmin(context, db, account.id);
  const prior = await db.matchCycle.findMany({ select: { id: true, status: true } });
  const priorSetting = await db.systemSetting.findUnique({ where: { key: 'weekly-cycle-schedule' } });
  let createdId: string | undefined;
  try {
    await db.matchCycle.updateMany({ data: { status: 'DRAFT' } });
    await db.systemSetting.deleteMany({ where: { key: 'weekly-cycle-schedule' } });
    await visit(page, '/admin/cycles');
    await page.getByRole('checkbox', { name: '启用自动续轮' }).check();
    await page.getByRole('button', { name: '保存自动轮次设置' }).click();
    await expect(page.getByRole('region', { name: '每周自动续轮' }).getByRole('status')).toContainText('已创建并开放报名');
    const created = await db.matchCycle.findFirstOrThrow({ where: { status: 'OPEN' } });
    createdId = created.id;
    expect(created.codename).toMatch(/^第\d+周$/);
    expect(created.revealAt.getUTCDay()).toBe(2);
    expect(created.revealAt.getUTCHours()).toBe(13);
    expect(created.revealAt.getTime() - created.participationDeadline.getTime()).toBe(2 * 3600000);
    await page.reload();
    await expect(page.getByRole('checkbox', { name: '启用自动续轮' })).toBeChecked();
    await expect(page.getByRole('button', { name: new RegExp(created.codename) })).toBeVisible();
    for (const width of [1280, 880, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByRole('heading', { name: '每周自动续轮' })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth), { message: `No persistent overflow at ${width}px` }).toBeLessThanOrEqual(0);
      await page.screenshot({ path: info.outputPath(`weekly-settings-${width}.png`) });
    }
    await page.getByRole('checkbox', { name: '启用自动续轮' }).uncheck();
    await page.getByRole('button', { name: '保存自动轮次设置' }).click();
    await expect(page.getByRole('region', { name: '每周自动续轮' }).getByRole('status')).toContainText('自动续轮已暂停');
    await page.reload();
    await expect(page.getByRole('checkbox', { name: '启用自动续轮' })).not.toBeChecked();
    expect((await db.matchCycle.findUniqueOrThrow({ where: { id: created.id } })).status).toBe('OPEN');
  } finally {
    if (createdId) await db.matchCycle.delete({ where: { id: createdId } });
    for (const cycle of prior) await db.matchCycle.update({ where: { id: cycle.id }, data: { status: cycle.status } });
    await db.systemSetting.deleteMany({ where: { key: 'weekly-cycle-schedule' } });
    if (priorSetting) await db.systemSetting.create({ data: priorSetting });
  }
});

test('@smoke admin cancels then deletes an empty draft with final list and audit proof', async ({ page, context, db, account }, info) => {
  await loginAdmin(context, db, account.id);
  const name = `空白草稿-${account.id}`;
  const cycle = await db.matchCycle.create({ data: { codename: name, status: 'DRAFT', participationDeadline: new Date('2035-01-01'), revealAt: new Date('2035-01-02') } });
  await visit(page, '/admin/cycles');
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await page.getByRole('button', { name: '删除草稿', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '删除草稿轮次' });
  await expect(dialog).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: info.outputPath('delete-draft-mobile.png') });
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(await db.matchCycle.findUnique({ where: { id: cycle.id } })).not.toBeNull();
  await page.getByRole('button', { name: '删除草稿', exact: true }).click();
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(name) })).toHaveCount(0);
  expect(await db.matchCycle.findUnique({ where: { id: cycle.id } })).toBeNull();
  expect(await db.auditLog.count({ where: { action: 'cycle.deleted', metadata: { path: ['cycleId'], equals: cycle.id } } })).toBe(1);
});

test('admin cannot delete active or historically used draft cycles', async ({ page, context, db, account }) => {
  await loginAdmin(context, db, account.id);
  const active = await db.matchCycle.findFirstOrThrow({ where: { status: 'OPEN' } });
  expect((await context.request.delete(`${api}/admin/cycles/${active.id}`)).status()).toBe(409);
  const cycle = await db.matchCycle.create({ data: { codename: `已有参与-${account.id}`, status: 'DRAFT', participationDeadline: new Date('2035-01-01'), revealAt: new Date('2035-01-02'), participations: { create: { userId: account.id, status: 'OPTED_OUT' } } } });
  await visit(page, '/admin/cycles');
  await page.getByRole('button', { name: new RegExp(cycle.codename) }).click();
  await expect(page.getByRole('button', { name: '删除草稿', exact: true })).toBeDisabled();
  expect((await context.request.delete(`${api}/admin/cycles/${cycle.id}`)).status()).toBe(409);
  expect(await db.matchCycle.findUnique({ where: { id: cycle.id } })).not.toBeNull();
  await db.matchCycle.delete({ where: { id: cycle.id } });
});

test('ordinary users cannot change the cycle schedule or delete cycles', async ({ context, signedIn }) => {
  void signedIn;
  expect((await context.request.get(`${api}/admin/weekly-cycle-settings`)).status()).toBe(401);
  expect((await context.request.put(`${api}/admin/weekly-cycle-settings`, { data: { enabled: true, deadlineHours: 2 } })).status()).toBe(401);
  expect((await context.request.delete(`${api}/admin/cycles/unused`)).status()).toBe(401);
});

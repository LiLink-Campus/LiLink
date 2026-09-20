import { test, expect, api, password, visit, completeProfile } from '../support/fixtures';

test('admin closes registration and user sees the updated state', async ({ page, signedIn, account, context, db }) => {
  void signedIn;
  await completeProfile(context, db);
  const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `admin-${account.email}`, passwordHash: user.passwordHash, displayName: '自动化管理员' } });
  const cycle = await db.matchCycle.findFirstOrThrow({ where: { status: 'OPEN' } });
  try {
    await visit(page, '/admin');
    await page.getByLabel('管理员邮箱', { exact: true }).fill(admin.email);
    await page.getByLabel('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: '进入后台', exact: true }).click();
    await expect.poll(async () => (await context.request.get(`${api}/admin-session/me`)).status()).toBe(200);
    await visit(page, '/admin/cycles');
    await page.getByRole('button', { name: '编辑轮次', exact: true }).click();
    await page.getByRole('combobox', { name: '状态', exact: true }).selectOption('DRAFT');
    await page.getByRole('button', { name: '保存轮次', exact: true }).click();
    await expect.poll(async () => (await db.matchCycle.findUniqueOrThrow({ where: { id: cycle.id } })).status).toBe('DRAFT');
    await visit(page, '/dashboard');
    await expect(page.getByRole('region').getByText('报名未开放', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '选择意向并报名', exact: true })).toHaveCount(0);
  } finally { await db.matchCycle.update({ where: { id: cycle.id }, data: { status: cycle.status } }); }
});

test('ordinary user cannot access admin APIs', async ({ signedIn, context }) => {
  void signedIn;
  expect((await context.request.get(`${api}/admin/cycles`)).status()).toBe(401);
});

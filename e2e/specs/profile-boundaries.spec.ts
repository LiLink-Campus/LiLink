import { test, expect, api, visit, completeProfile } from '../support/fixtures';

test.beforeEach(async ({ signedIn }) => { void signedIn; });

test('free users cannot change premium school exclusions', async ({ page, context, db }, info) => {
  await completeProfile(context, db);
  const school = await db.school.findUniqueOrThrow({ where: { slug: 'e2e-school' } });
  await visit(page, '/dashboard/profile#profile-attention-hard_excluded_partner_schools');
  await expect(page.getByRole('textbox', { name: '搜索学校' })).toBeVisible();
  await page.getByRole('textbox', { name: '搜索学校' }).fill(school.name);
  await page.getByRole('region', { name: '当前题目' }).locator('summary').filter({ hasText: school.name }).click();
  const choice = page.getByRole('group', { name: `${school.name} 排除性别` }).getByRole('checkbox', { name: '男', exact: true });
  await page.getByRole('group', { name: `${school.name} 排除性别` }).getByText('男', { exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '开通 VIP，设置高级筛选' });
  await expect(dialog).toBeVisible();
  await expect(choice).not.toBeChecked();
  await info.attach('premium-school-gate', { body: await page.screenshot(), contentType: 'image/png' });
  await dialog.getByRole('button', { name: '暂不开通，继续填写' }).click();
  const saved = await (await context.request.get(`${api}/me/questionnaire`)).json();
  expect(saved.answers.hard_excluded_partner_schools).toEqual([]);
  expect(saved.answers.hard_excluded_partner_school_genders).toEqual([]);
});

test('VIP school exclusions survive reload and hash navigation selects the right question', async ({ page, context, db, account }, info) => {
  await db.vipActivation.create({ data: {
    codeHash: `profile-school-${account.id}`, batch: 'e2e', userId: account.id,
    activatedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000),
  } });
  await completeProfile(context, db);
  const school = await db.school.findUniqueOrThrow({ where: { slug: 'e2e-school' } });
  const route = '/dashboard/profile#profile-attention-hard_excluded_partner_schools';
  await visit(page, route);
  const search = page.getByRole('textbox', { name: '搜索学校' });
  await expect(search).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/profile$/);
  await search.fill(school.name);
  await page.getByRole('region', { name: '当前题目' }).locator('summary').filter({ hasText: school.name }).click();
  const choice = page.getByRole('group', { name: `${school.name} 排除性别` }).getByRole('checkbox', { name: '男', exact: true });
  await page.getByRole('group', { name: `${school.name} 排除性别` }).getByText('男', { exact: true }).click();
  await expect(choice).toBeChecked();
  await expect(page.getByRole('main').getByText('全部修改已保存', { exact: true })).toBeVisible();
  const saved = await (await context.request.get(`${api}/me/questionnaire`)).json();
  expect(saved.answers.hard_excluded_partner_school_genders).toEqual([{ schoolId: school.id, genders: ['男'] }]);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await visit(page, route);
  await expect(search).toBeVisible();
  await search.fill(school.name);
  await page.getByRole('region', { name: '当前题目' }).locator('summary').filter({ hasText: school.name }).click();
  await expect(choice).toBeChecked();
  await info.attach('school-exclusion-restored', { body: await page.screenshot(), contentType: 'image/png' });
});

test('viewing an unconfirmed weight does not acknowledge it before an explicit save', async ({ page, context, db, account }) => {
  await completeProfile(context, db);
  const response = await db.questionnaireResponse.findUniqueOrThrow({ where: { userId: account.id } });
  const answers = { ...response.answers };
  const signatures = { ...response.acknowledgedHardMatchSignatures };
  delete answers.hard_weight_kg;
  delete signatures.hard_weight_kg;
  await db.questionnaireResponse.update({ where: { userId: account.id }, data: {
    answers, acknowledgedHardMatchSignatures: signatures,
  } });
  await page.clock.install();
  await visit(page, '/dashboard/profile#profile-attention-hard_weight_kg');
  const weight = page.getByRole('combobox', { name: '选择你的体重' });
  await expect(weight).toBeVisible();
  await expect(weight).toHaveValue('');
  await page.clock.runFor(1000);
  const before = await (await context.request.get(`${api}/me/questionnaire`)).json();
  expect(before.attention.pendingUpdatedKeys).toContain('hard_weight_kg');
  expect(before.attention.items.find((item: { key: string }) => item.key === 'hard_weight_kg').acknowledged).toBe(false);
  await weight.selectOption('57');
  await page.clock.runFor(1000);
  await expect(page.getByRole('main').getByText('全部修改已保存', { exact: true })).toBeVisible();
  const after = await (await context.request.get(`${api}/me/questionnaire`)).json();
  expect(after.answers.hard_weight_kg).toBe(57);
  expect(after.attention.pendingKeys).not.toContain('hard_weight_kg');
});

test('edits made while a save is in flight persist as the latest value', async ({ page, context, db }) => {
  await completeProfile(context, db);
  await page.clock.install();
  await visit(page, '/dashboard/profile');
  const name = page.getByRole('textbox', { name: '昵称', exact: true });
  await expect(name).toBeVisible();
  let release!: () => void;
  let received!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const firstResponse = new Promise<void>(resolve => { received = resolve; });
  let requests = 0;
  await page.route('**/api/questionnaire', async route => {
    const response = await route.fetch();
    if (++requests === 1) { received(); await hold; }
    await route.fulfill({ response });
  });
  try {
    await name.fill('先提交的昵称');
    await page.clock.runFor(1000);
    await firstResponse;
    await name.fill('保存中继续编辑的最终昵称');
    await page.clock.runFor(1000);
  } finally {
    release();
  }
  await expect(page.getByRole('main').getByText('全部修改已保存', { exact: true })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(name).toHaveValue('保存中继续编辑的最终昵称');
  expect((await (await context.request.get(`${api}/auth/me`)).json()).displayName).toBe('保存中继续编辑的最终昵称');
});

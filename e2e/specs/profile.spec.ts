import { test, expect, api, visit, completeProfile } from '../support/fixtures';
import { readFileSync } from 'node:fs';
import path from 'node:path';

test.beforeEach(async ({ signedIn }) => { void signedIn; });

test('archived profile basics remain editable without restoring questionnaire completion @smoke', async ({ page, context, db, account }, testInfo) => {
  const version = await db.questionnaireVersion.findFirstOrThrow({ where: { isCurrent: true } });
  const resetAt = new Date('2026-09-20T12:00:00.000Z');
  const response = await db.questionnaireResponse.create({ data: {
    userId: account.id, versionId: version.id, answers: {}, updatedAt: resetAt,
  } });
  await db.user.update({ where: { id: account.id }, data: {
    preferredContactChannel: 'WECHAT',
    contactMethods: { create: { type: 'WECHAT', value: 'synthetic_wechat' } },
  } });
  await db.questionnaireResponseArchive.create({ data: {
    id: `archive-${account.id}`, releaseId: 'autumn-reset-2026-09-20', sourceResponseId: response.id,
    userId: account.id, versionId: version.id, archivedAt: resetAt, sourceUpdatedAt: resetAt,
    submittedAt: resetAt, answers: { hard_gender: '女', hard_one_liner_intro: '原来的介绍，喜欢散步和读书。', hard_height_cm: 175, old_question: 'old' },
  } });
  const migration = readFileSync(path.join(process.env.E2E_WORKSPACE!, 'apps/api/prisma/migrations/20260921110000_reuse_archived_profile_basics/migration.sql'), 'utf8');
  const update = migration.slice(migration.indexOf('WITH historical_profile'), migration.lastIndexOf('COMMIT;')).trim();
  await db.$executeRawUnsafe(update);

  await visit(page, '/dashboard/profile');
  const name = page.getByRole('textbox', { name: '昵称', exact: true });
  await expect(name).toHaveValue('自动化同学');
  async function openQuestion(title: string) {
    await expect(page.getByRole('region', { name: '当前题目' })).toBeVisible();
    const directory = page.getByRole('button', { name: '题目目录', exact: true });
    if (await directory.isVisible()) await directory.click();
    await page.getByRole('button', { name: new RegExp(`关于你第 \\d+ 题：${title}$`) }).filter({ visible: true }).click();
  }
  await openQuestion('一句话介绍');
  const intro = page.getByRole('textbox', { name: /一句话介绍/ });
  await expect(intro).toHaveValue('原来的介绍，喜欢散步和读书。');
  await page.screenshot({ path: testInfo.outputPath('restored-intro.png'), fullPage: true });
  await openQuestion('联系方式');
  await expect(page.getByRole('textbox', { name: '微信内容', exact: true })).toHaveValue('synthetic_wechat');
  await openQuestion('性别');
  await expect(page.getByRole('radio', { name: '女', exact: true })).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath('restored-gender.png'), fullPage: true });
  await openQuestion('身高');
  await expect(page.locator('select[name="heightCm"]')).toHaveValue('');
  const saved = await (await context.request.get(`${api}/me/questionnaire`)).json();
  expect(saved.submittedAt).toBeNull();
  expect(saved.answers.hard_gender).toBe('女');
  expect(saved.answers.hard_one_liner_intro).toBe('原来的介绍，喜欢散步和读书。');
  expect(saved.answers.old_question).toBeUndefined();
  const participation = await context.request.put(`${api}/me/participation`, { data: { optIn: true, intent: 'BOTH' } });
  expect(participation.status()).toBe(400);

  await openQuestion('颜值自评');
  await page.route('**/api/questionnaire', route => route.abort('failed'));
  const looks = page.getByRole('slider', { name: '颜值自评', exact: true });
  await looks.focus();
  await looks.press('Home');
  await looks.press('ArrowRight');
  await looks.press('ArrowRight');
  await looks.press('ArrowRight');
  await expect(page.getByText('正在重试保存…', { exact: true })).toBeVisible();
  await expect(page.getByText('保存失败', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('save-retrying.png'), fullPage: true });
  await expect(page.getByText('草稿已自动保存', { exact: true })).toBeVisible();
  await page.unroute('**/api/questionnaire');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openQuestion('颜值自评');
  await expect(looks).toHaveAttribute('aria-valuetext', '4');
  const retried = await (await context.request.get(`${api}/me/questionnaire`)).json();
  expect(retried.draft.hardMatchForm.looks).toBe('4');
  expect(retried.submittedAt).toBeNull();
  await page.screenshot({ path: testInfo.outputPath('save-recovered.png'), fullPage: true });

  await openQuestion('一句话介绍');
  await intro.fill('');
  await expect(page.getByRole('main').getByText('草稿已自动保存', { exact: true })).toBeVisible();
  expect(await db.$executeRawUnsafe(update)).toBe(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openQuestion('一句话介绍');
  await expect(intro).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('profile autosave persists after reload @smoke', async ({ page, context, db }) => {
  await completeProfile(context, db);
  await visit(page, '/dashboard/profile');
  const name = page.getByRole('textbox', { name: '昵称', exact: true });
  await name.fill('刷新后仍在的昵称');
  await expect(page.getByRole('main').getByText('全部修改已保存', { exact: true })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(name).toHaveValue('刷新后仍在的昵称');
  await expect(page.getByRole('main').getByText('全部修改已保存', { exact: true })).toBeVisible();
});

test('incomplete profile remains a draft and cannot participate @smoke', async ({ page, context }) => {
  await visit(page, '/dashboard/profile');
  await page.getByRole('textbox', { name: '昵称', exact: true }).fill('资料未完成');
  await expect(page.getByRole('main').getByText('草稿已自动保存', { exact: true })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('textbox', { name: '昵称', exact: true })).toHaveValue('资料未完成');
  const response = await context.request.put(`${api}/me/participation`, { data: { optIn: true, intent: 'BOTH' } });
  expect(response.status()).toBe(400);
  expect((await response.json()).message).toMatch(/questionnaire|profile|资料|问卷/i);
  await visit(page, '/dashboard');
  await expect(page.getByRole('button', { name: '选择意向并报名', exact: true })).toHaveCount(0);
});

test('save failure preserves input and recovers after service restoration', async ({ page, context, db }) => {
  test.setTimeout(65_000);
  await completeProfile(context, db);
  await visit(page, '/dashboard/profile');
  await page.route('**/v1/me/questionnaire', route => route.request().method() === 'PUT'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'E2E 暂时无法保存' }) })
    : route.continue());
  await page.route('**/api/questionnaire', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'E2E 暂时无法保存' }) }));
  const name = page.getByRole('textbox', { name: '昵称', exact: true });
  await name.fill('断网时保留的昵称');
  await expect(page.getByText('正在重试保存…', { exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByText('保存失败', { exact: true })).toBeVisible({ timeout: 35_000 });
  await expect(name).toHaveValue('断网时保留的昵称');
  await expect(page.getByRole('main').getByText('全部修改已保存', { exact: true })).toHaveCount(0);
  expect((await (await context.request.get(`${api}/auth/me`)).json()).displayName).toBe('自动化同学');
  await page.unroute('**/v1/me/questionnaire');
  await page.unroute('**/api/questionnaire');
  await page.getByRole('button', { name: '重试保存', exact: true }).click();
  await expect(page.getByRole('main').getByText('全部修改已保存', { exact: true })).toBeVisible({ timeout: 25_000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(name).toHaveValue('断网时保留的昵称');
});

test('expired session requires login on protected navigation', async ({ page }) => {
  await visit(page, '/dashboard/profile');
  await page.context().clearCookies();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/login/);
});

test('rapid back navigation restores a usable profile', async ({ page }) => {
  await visit(page, '/dashboard/profile');
  await page.goto('/dashboard/me', { waitUntil: 'domcontentloaded' });
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('textbox', { name: '昵称', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '昵称', exact: true }).fill('返回后可编辑');
  await expect(page.getByRole('main').getByText('草稿已自动保存', { exact: true })).toBeVisible();
});

test('question pickers load on navigation and preserve saved selections @smoke', async ({ page, context, db }) => {
  await completeProfile(context, db);
  await visit(page, '/dashboard/profile');
  const height = page.locator('select[name="heightCm"]');
  const weight = page.locator('select[name="weightKg"]');
  await expect(height.locator('option')).toHaveCount(2);
  await expect(weight.locator('option')).toHaveCount(2);

  async function openQuestion(title: string) {
    await expect(page.getByRole('region', { name: '当前题目' })).toBeVisible();
    const directory = page.getByRole('button', { name: '题目目录', exact: true });
    if (await directory.isVisible()) await directory.click();
    await page.getByRole('button', { name: new RegExp(`关于你第 \\d+ 题：${title}$`) }).filter({ visible: true }).click();
  }
  await openQuestion('身高');
  await expect(height).toBeVisible();
  expect(await height.locator('option').count()).toBeGreaterThan(100);
  await height.selectOption('177');
  await expect(page.getByRole('main').getByText('全部修改已保存', { exact: true })).toBeVisible();
  await openQuestion('体重');
  await expect(weight).toBeVisible();
  expect(await weight.locator('option').count()).toBeGreaterThan(200);
  await expect(height.locator('option')).toHaveCount(2);
  await weight.selectOption('72');
  await expect(page.getByRole('main').getByText('全部修改已保存', { exact: true })).toBeVisible();
  await openQuestion('身高');
  await expect(height).toHaveValue('177');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openQuestion('体重');
  await expect(page.getByRole('combobox', { name: '选择你的体重' })).toHaveValue('72');
});

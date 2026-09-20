import { test, expect, api, visit, completeProfile } from '../support/fixtures';

test.beforeEach(async ({ signedIn }) => { void signedIn; });

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
  await completeProfile(context, db);
  await visit(page, '/dashboard/profile');
  await page.route('**/v1/me/questionnaire', route => route.request().method() === 'PUT'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'E2E 暂时无法保存' }) })
    : route.continue());
  const name = page.getByRole('textbox', { name: '昵称', exact: true });
  await name.fill('断网时保留的昵称');
  await expect(page.getByRole('main').getByText('保存失败', { exact: true })).toBeVisible();
  await expect(name).toHaveValue('断网时保留的昵称');
  await expect(page.getByRole('main').getByText('全部修改已保存', { exact: true })).toHaveCount(0);
  expect((await (await context.request.get(`${api}/auth/me`)).json()).displayName).toBe('自动化同学');
  await page.unroute('**/v1/me/questionnaire');
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

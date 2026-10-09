import { test, expect, api, visit, completeProfile } from '../support/fixtures';

test.beforeEach(async ({ signedIn }) => { void signedIn; });

test('archived profile basics remain editable without restoring questionnaire completion @smoke', async ({ page, context, db, account }, testInfo) => {
  const version = await db.questionnaireVersion.findFirstOrThrow({ where: { isCurrent: true } });
  // Historical upgrades verify the SQL. Begin at its incomplete migrated state
  // here to exercise the real editor, retry, draft and reload behavior.
  await db.questionnaireResponse.create({ data: {
    userId: account.id, versionId: version.id,
    answers: { hard_gender: '女', hard_one_liner_intro: '原来的介绍，喜欢散步和读书。' },
  } });
  await db.user.update({ where: { id: account.id }, data: {
    preferredContactChannel: 'WECHAT',
    contactMethods: { create: { type: 'WECHAT', value: 'synthetic_wechat' } },
  } });
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

  await openQuestion('联系方式');
  await expect(page.getByRole('textbox', { name: '微信内容', exact: true })).toHaveValue('synthetic_wechat');
  await openQuestion('性别');
  await expect(page.getByRole('radio', { name: '女', exact: true })).toBeChecked();

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

  await expect(page.getByText('草稿已自动保存', { exact: true })).toBeVisible();
  await page.unroute('**/api/questionnaire');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openQuestion('颜值自评');
  await expect(looks).toHaveAttribute('aria-valuetext', '4');
  const retried = await (await context.request.get(`${api}/me/questionnaire`)).json();
  expect(retried.draft.hardMatchForm.looks).toBe('4');
  expect(retried.submittedAt).toBeNull();

  await openQuestion('一句话介绍');
  await intro.fill('');
  await expect(page.getByRole('main').getByText('草稿已自动保存', { exact: true })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openQuestion('一句话介绍');
  await expect(intro).toHaveValue('');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
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

test('VIP school exclusions survive reload and hash navigation selects the right question', async ({ page, context, db, account }, info) => {
  await db.vipActivation.create({ data: {
    codeHash: `profile-school-${account.id}`, batch: 'e2e', userId: account.id,
    activatedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000),
  } });
  await completeProfile(context, db);
  const school = await db.school.findUniqueOrThrow({ where: { slug: 'e2e-school' } });
  const cycle = await db.matchCycle.create({ data: {
    codename: `profile-estimate-${account.id}`, status: 'OPEN',
    participationDeadline: new Date(Date.now() + 86_400_000),
    revealAt: new Date(Date.now() + 172_800_000),
  } });
  try {
    const route = '/dashboard/profile#profile-attention-hard_excluded_partner_schools';
    const estimateResponse = page.waitForResponse(response => response.url() === `${api}/me/match-estimate`);
    await visit(page, route);
    const estimate = await estimateResponse;
    expect(estimate.ok(), await estimate.text()).toBeTruthy();
    expect((await estimate.json()).available).toBe(true);
    await expect(page.getByText('排除后匹配到的概率：', { exact: true })).toBeVisible();
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
    // A second navigation must wait for the reloaded router's hydration;
    // its initial history commit can otherwise overwrite the new fragment.
    await expect(page.getByRole('textbox', { name: '昵称', exact: true })).toBeEditable();
    await visit(page, route);
    await expect(search).toBeVisible();
    await search.fill(school.name);
    await page.getByRole('region', { name: '当前题目' }).locator('summary').filter({ hasText: school.name }).click();
    await expect(choice).toBeChecked();

  } finally { await db.matchCycle.delete({ where: { id: cycle.id } }); }
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

test('in-flight edits keep focus and survive reload and back navigation @mobile', async ({ page, context, db }) => {
  await completeProfile(context, db);
  await page.clock.install();
  await visit(page, '/dashboard/profile');
  await page.getByRole('button', { name: '下一题 →', exact: true }).click();
  const intro = page.getByRole('textbox', { name: /一句话介绍/ });
  await intro.fill('可复现输入');
  for (let step = 0; step < 4; step++) await intro.press('ArrowLeft');
  await intro.pressSequentially('光标保持');
  await page.clock.runFor(1000);
  await expect(page.getByRole('main').getByText('全部修改已保存', { exact: true })).toBeVisible();
  await expect(intro).toBeFocused();
  await expect(intro).toHaveValue('可光标保持复现输入');
  expect(await intro.evaluate(element => (element as HTMLTextAreaElement).selectionStart)).toBe(5);
  expect((await (await context.request.get(`${api}/me/questionnaire`)).json()).answers.hard_one_liner_intro).toBe('可光标保持复现输入');
  await page.getByRole('button', { name: '← 上一题', exact: true }).click();
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
    await name.press('ArrowLeft');
    const cursor = await name.evaluate(element => (element as HTMLInputElement).selectionStart);
    await page.clock.runFor(1000);
    await expect(name).toBeFocused();
    expect(await name.evaluate(element => (element as HTMLInputElement).selectionStart)).toBe(cursor);
  } finally {
    release();
  }
  await expect(page.getByRole('main').getByText('全部修改已保存', { exact: true })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(name).toHaveValue('保存中继续编辑的最终昵称');
  expect((await (await context.request.get(`${api}/auth/me`)).json()).displayName).toBe('保存中继续编辑的最终昵称');
  await page.getByRole('link', { name: '我的匹配', exact: true }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/match$/);
  await page.goBack();
  await expect(name).toHaveValue('保存中继续编辑的最终昵称');
  await expect(name).toBeEditable();
});

test('four value questions require exactly three selections and keep incomplete edits as a draft @smoke', async ({ page, context, db }, info) => {
  await completeProfile(context, db);
  const { questions } = await (await context.request.get(`${api}/questionnaire/current`)).json();
  for (const key of ['values']) {
    const q = questions.find((q: { key: string }) => q.key === key);
    expect(q.selectionLimit).toBe(3);
    await visit(page, '/dashboard/profile');
    await expect(page.getByRole('region', { name: '当前题目' })).toBeVisible();
    const directory = page.getByRole('button', { name: '题目目录', exact: true });
    if (await directory.isVisible()) await directory.click();
    await page.getByRole('button', { name: new RegExp(`价值观第 \\d+ 题：${q.prompt.replace(/[?？。.]/g, '.')}$`) }).filter({ visible: true }).click();
    const group = page.getByRole('group', { name: q.prompt, exact: true });
    const choices = group.getByRole('checkbox');
    await expect(group.getByText('本题必须选择 3 项。', { exact: true })).toBeVisible();
    await expect(choices.nth(3)).toBeDisabled();
    await group.getByText(q.options[0].label, { exact: true }).click();
    await expect(choices.nth(0)).not.toBeChecked();
    await expect(page.getByText('草稿已自动保存', { exact: true })).toBeVisible();
    await expect(choices.nth(3)).toBeEnabled();

    await group.getByText(q.options[3].label, { exact: true }).click();
    await expect(page.getByText('全部修改已保存', { exact: true })).toBeVisible();
    const saved = await (await context.request.get(`${api}/me/questionnaire`)).json();
    expect(saved.answers[key]).toEqual(q.options.slice(1, 4).map((option: { value: string }) => option.value));
    expect(saved.draft).toBeNull();
  }
});

test('dashboard retry fetches fresh server data after a read timeout', async ({ page, db }, info) => {
  let release!: () => void;
  let acquired!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { acquired = resolve; });
  const blocked = db.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe('LOCK TABLE "QuestionnaireResponse" IN ACCESS EXCLUSIVE MODE');
    acquired();
    await hold;
  }, { timeout: 25_000 });
  try {
    await ready;
    await visit(page, '/dashboard/profile');
    await expect(page.getByRole('heading', { name: '暂时无法加载' })).toBeVisible({ timeout: 15_000 });

  } finally {
    release();
    await blocked;
  }
  await page.getByRole('button', { name: '重新加载', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '昵称', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '暂时无法加载' })).toHaveCount(0);

});

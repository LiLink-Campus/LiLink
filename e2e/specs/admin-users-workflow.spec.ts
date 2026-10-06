import { test, expect, api, password, visit, completeProfile } from '../support/fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// Refactor baseline: list/selection boundaries, persisted edits, failed saves,
// status changes, tab reads, and late responses from a closed detail dialog.
test('admin user management preserves visible and persisted results @smoke', async ({ page, db, account, context, signedIn }, info) => {
  void signedIn;
  await completeProfile(context, db);
  const source = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: {
    email: `operator-${account.email}`, passwordHash: source.passwordHash, displayName: '合成运营员',
  } });
  await visit(page, '/admin');
  await page.getByLabel('管理员邮箱', { exact: true }).fill(admin.email);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '进入后台', exact: true }).click();
  await expect(page.getByRole('heading', { name: '运营概览', exact: true })).toBeVisible();
  await visit(page, '/admin/users');
  await page.getByPlaceholder('邮箱、昵称、姓名或学校').fill(account.email);
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  const open = () => page.getByRole('button', { name: `查看 自动化同学 ${account.email}`, exact: true });
  await open().click();
  const dialog = page.getByRole('dialog', { name: '用户详情', exact: true });
  await expect(dialog.getByRole('button', { name: '停用账号', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: '编辑资料', exact: true }).click();
  const headline = dialog.getByRole('row').filter({ hasText: '一句话介绍' }).getByRole('textbox');
  await headline.fill('合成运营编辑验收');
  const updateUrl = `${api}/admin/users/${account.id}`;
  await page.route(updateUrl, async route => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '合成保存故障' }) });
    } else await route.continue();
  });
  await dialog.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('合成保存故障');
  await expect(headline).toHaveValue('合成运营编辑验收');
  await dialog.getByRole('alert').evaluate(element => element.scrollIntoView({ block: 'center' }));
  await info.attach('admin-edit-failure-error', { contentType: 'image/png', body: await page.screenshot({ animations: 'disabled' }) });
  await headline.scrollIntoViewIfNeeded();
  await info.attach('admin-edit-failure-retains-draft', { contentType: 'image/png', body: await page.screenshot({ animations: 'disabled' }) });
  expect((await db.userProfile.findUnique({ where: { userId: account.id } }))?.headline).not.toBe('合成运营编辑验收');
  await page.unroute(updateUrl);
  await dialog.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '编辑资料', exact: true })).toBeVisible();
  await expect(dialog.getByText('合成运营编辑验收', { exact: true })).toBeVisible();
  expect((await db.userProfile.findUniqueOrThrow({ where: { userId: account.id } })).headline).toBe('合成运营编辑验收');
  await dialog.getByRole('button', { name: '调整额度', exact: true }).click();
  await dialog.getByLabel('普通邮箱邀请码额度上限', { exact: true }).fill('7');
  await dialog.getByRole('button', { name: '保存额度', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('普通邮箱邀请码额度已更新。');
  expect((await db.user.findUniqueOrThrow({ where: { id: account.id } })).nonEduReferralLimit).toBe(7);
  await dialog.getByRole('button', { name: '停用账号', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('账号已停用。');
  expect((await db.user.findUniqueOrThrow({ where: { id: account.id } })).status).toBe('SUSPENDED');
  expect((await context.request.get(`${api}/me/dashboard`)).status()).toBe(401);
  await dialog.getByRole('button', { name: '恢复账号', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('账号已恢复，可正常登录。');
  await dialog.getByRole('button', { name: /^问卷回答/ }).click();
  await expect(dialog.getByRole('heading', { name: '硬性条件', exact: true })).toBeVisible();
  await info.attach('admin-questionnaire-tab', { contentType: 'image/png', body: await page.screenshot({ animations: 'disabled' }) });
  await dialog.getByRole('button', { name: /^轮次参与/ }).click();
  await expect(dialog.getByText('暂无轮次参与记录。', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '基本资料', exact: true }).click();
  const viewport = page.viewportSize()!;
  for (const width of [320, 879, 880, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await dialog.evaluate(element => { element.scrollTop = 0; });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await info.attach(`admin-user-detail-${width}`, { contentType: 'image/png', body: await page.screenshot({ animations: 'disabled' }) });
  }
  await page.setViewportSize(viewport);
  await dialog.getByRole('button', { name: '关闭用户详情', exact: true }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder('邮箱、昵称、姓名或学校').fill(account.email);
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await open().click();
  await expect(dialog.getByText('合成运营编辑验收', { exact: true })).toBeVisible();
  expect(await db.auditLog.count({ where: { adminActorId: admin.id, action: { in: ['user.updated', 'user.status_updated', 'user.referral_limit_updated'] } } })).toBe(4);
  await info.attach('admin-users-contract', { contentType: 'application/json', body: JSON.stringify({
    project: info.project.name, assertions: { failedSaveRetainsDraft: true, savedProfileReloads: true,
      referralLimitPersists: true, suspensionRejectsUserRequest: true, restoreAndTabsWork: true, auditEvents: 4 },
  }) });
});

test('admin selection ignores a late detail response and filters reset pagination @smoke', async ({ page, db, account, context }, info) => {
  const source = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `selection-${account.email}`, passwordHash: source.passwordHash } });
  expect((await context.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBe(true);
  const tag = `selection-${account.id}`;
  await Promise.all(Array.from({ length: 7 }, (_, i) => db.user.create({ data: {
    email: `${tag}-${i}@school.example.test`, passwordHash: source.passwordHash, displayName: `合成选择 ${i}`, status: 'ACTIVE',
  } })));
  await visit(page, '/admin/users');
  await page.getByPlaceholder('邮箱、昵称、姓名或学校').fill(tag);
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect(page.getByText(/2 \/ 2/)).toBeVisible();
  await page.getByRole('combobox', { name: '账号类型', exact: true }).selectOption('real');
  await expect(page.getByText(/1 \/ 2/)).toBeVisible();
  const listing = await context.request.get(`${api}/admin/users`, { params: { search: tag, page: '1', pageSize: '6' } });
  const [first, second] = (await listing.json()).items;
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pending = new Promise<void>(resolve => { entered = resolve; });
  await page.route(`${api}/admin/users/${first.id}`, async route => {
    const response = await route.fetch();
    entered();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole('button', { name: `查看 ${first.displayName} ${first.email}`, exact: true }).click();
    await pending;
    await page.getByRole('button', { name: '关闭用户详情', exact: true }).click();
    await page.getByRole('button', { name: `查看 ${second.displayName} ${second.email}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '用户详情', exact: true });
    await expect(dialog.getByRole('heading', { name: second.displayName, exact: true })).toBeVisible();
    const delivered = page.waitForResponse(`${api}/admin/users/${first.id}`);
    release();
    await delivered;
    await expect(dialog.getByRole('heading', { name: second.displayName, exact: true })).toBeVisible();
    await expect(dialog.getByText(first.email, { exact: true })).toHaveCount(0);
    await info.attach('admin-selection-contract', { contentType: 'application/json', body: JSON.stringify({
      assertions: { lateResponseIgnored: true, filterResetsPagination: true },
    }) });
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
});

// A post-save detail reload must not erase the next user's loaded details.
for (const held of ['reload', 'write'] as const) {
test(`admin ignores a late post-action ${held} after changing users @smoke`, async ({ page, db, account, context }, info) => {
  const source = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `reload-${account.email}`, passwordHash: source.passwordHash } });
  expect((await context.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBe(true);
  const tag = `reload-${account.id}`;
  const peers = await Promise.all([0, 1].map(i => db.user.create({ data: {
    email: `${tag}-${i}@school.example.test`, passwordHash: source.passwordHash, displayName: `合成回读 ${i}`, status: 'ACTIVE',
  } })));
  const cycle = await db.matchCycle.findFirstOrThrow();
  await db.cycleParticipation.create({ data: { cycleId: cycle.id, userId: peers[1].id, status: 'OPTED_IN' } });
  await visit(page, '/admin/users');
  await page.getByPlaceholder('邮箱、昵称、姓名或学校').fill(tag);
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await page.getByRole('button', { name: `查看 ${peers[0].displayName} ${peers[0].email}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '用户详情', exact: true });
  await expect(dialog.getByRole('button', { name: '停用账号', exact: true })).toBeEnabled();
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pending = new Promise<void>(resolve => { entered = resolve; });
  const heldUrl = `${api}/admin/users/${peers[0].id}${held === 'write' ? '/status' : ''}`;
  await page.route(heldUrl, async route => {
    const response = await route.fetch(); entered(); await gate; await route.fulfill({ response });
  });
  try {
    await dialog.getByRole('button', { name: '停用账号', exact: true }).click();
    await pending;
    await dialog.getByRole('button', { name: '关闭用户详情', exact: true }).click();
    await page.getByRole('button', { name: `查看 ${peers[1].displayName} ${peers[1].email}`, exact: true }).click();
    const count = dialog.getByText('轮次参与', { exact: true }).locator('..').locator('strong');
    await expect(count).toHaveText('1');
    const delivered = page.waitForResponse(heldUrl);
    release(); await (await delivered).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(dialog.getByRole('button', { name: '停用账号', exact: true })).toBeEnabled();
    await expect(count).toHaveText('1');
    await expect(dialog.getByRole('status')).toHaveCount(0);
    await expect(dialog.getByRole('heading', { name: peers[1].displayName!, exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: '关闭用户详情', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: peers[0].email }).getByText('已停用', { exact: true })).toBeVisible();
    await info.attach('admin-action-reload-contract', { contentType: 'application/json', body: JSON.stringify({ assertions: { held, lateActionResultIgnored: true, globalListUpdated: true } }) });
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); }
});
}

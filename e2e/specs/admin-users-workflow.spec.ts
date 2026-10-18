import { test, expect, api, password, visit, completeProfile, mailCode } from '../support/fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// Refactor baseline: list/selection boundaries, persisted edits, failed saves,
// status changes, tab reads, and late responses from a closed detail dialog.
test('admin user management preserves visible and persisted results @smoke @mobile @webkit', async ({ page, db, account, context, signedIn }, info) => {
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

  await headline.scrollIntoViewIfNeeded();

  expect((await db.userProfile.findUnique({ where: { userId: account.id } }))?.headline).not.toBe('合成运营编辑验收');
  await page.unroute(updateUrl);
  await dialog.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '编辑资料', exact: true })).toBeVisible();
  await expect(dialog.getByText('合成运营编辑验收', { exact: true })).toBeVisible();
  expect((await db.userProfile.findUniqueOrThrow({ where: { userId: account.id } })).headline).toBe('合成运营编辑验收');
  await dialog.getByRole('button', { name: '调整额度', exact: true }).click();
  await dialog.getByLabel('教育认证邀请额度上限', { exact: true }).fill('7');
  await dialog.getByRole('button', { name: '保存额度', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('教育认证邀请额度已更新。');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('admin-education-quota.png'), fullPage: true });
  expect((await db.user.findUniqueOrThrow({ where: { id: account.id } })).nonEduReferralLimit).toBe(7);
  await dialog.getByRole('button', { name: '停用账号', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('账号已停用。');
  expect((await db.user.findUniqueOrThrow({ where: { id: account.id } })).status).toBe('SUSPENDED');
  expect((await context.request.get(`${api}/me/dashboard`)).status()).toBe(401);
  await dialog.getByRole('button', { name: '恢复账号', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('账号已恢复，可正常登录。');
  await dialog.getByRole('button', { name: '关于你', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: '关于你', exact: true })).toBeVisible();

  await dialog.getByRole('button', { name: /^轮次参与/ }).click();
  await expect(dialog.getByText('暂无轮次参与记录。', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '账号信息', exact: true }).click();

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

// Failure boundaries: another account's education mailbox is unavailable for
// login edits; the owner may reuse it; an edit waiting on a row lock must recheck
// a claim committed by a concurrent education upgrade before saving.
test('admin email edits preserve education mailbox ownership @mobile @webkit', async ({ page, db, account, context, browser }, info) => {
  const source = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `mailbox-admin-${account.email}`, passwordHash: source.passwordHash } });
  expect((await context.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBe(true);
  const claimantContext = await browser.newContext();
  try {
    const claimant = await db.user.create({ data: { email: `owner-${account.id}@personal.example.test`, passwordHash: source.passwordHash, status: 'ACTIVE' } });
    expect((await claimantContext.request.post(`${api}/auth/login`, { data: { email: claimant.email, password } })).ok()).toBe(true);
    const claimedEmail = `claimed-${account.id}@school.example.test`;
    expect((await claimantContext.request.post(`${api}/me/education/email/request-code`, { data: { email: claimedEmail } })).ok()).toBe(true);
    expect((await claimantContext.request.post(`${api}/me/education/email/verify`, { data: { email: claimedEmail, code: await mailCode(page, claimedEmail) } })).ok()).toBe(true);

    await visit(page, '/admin/users');
    await page.getByPlaceholder('邮箱、昵称、姓名或学校').fill(account.email);
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await page.getByRole('button', { name: `查看 自动化同学 ${account.email}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '用户详情', exact: true });
    await dialog.getByRole('button', { name: '编辑资料', exact: true }).click();
    const emailInput = dialog.getByRole('row').filter({ has: page.getByText('邮箱', { exact: true }) }).getByRole('textbox');
    await emailInput.fill(claimedEmail);
    await dialog.getByRole('button', { name: '保存修改', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('email is already in use');
    await expect(emailInput).toHaveValue(claimedEmail);
    expect((await db.user.findUniqueOrThrow({ where: { id: account.id } })).email).toBe(account.email);
    await page.screenshot({ path: info.outputPath('education-mailbox-conflict.png'), fullPage: true });
    const selfUpdate = await context.request.patch(`${api}/admin/users/${claimant.id}`, { data: { email: claimedEmail } });
    expect(selfUpdate.ok(), await selfUpdate.text()).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: claimant.id } })).educationEmail).toBe(claimedEmail);

    const concurrent = await db.user.create({ data: { email: `race-owner-${account.id}@personal.example.test`, passwordHash: source.passwordHash, status: 'ACTIVE' } });
    expect((await claimantContext.request.post(`${api}/auth/login`, { data: { email: concurrent.email, password } })).ok()).toBe(true);
    const raceEmail = `race-claimed-${account.id}@school.example.test`;
    expect((await claimantContext.request.post(`${api}/me/education/email/request-code`, { data: { email: raceEmail } })).ok()).toBe(true);
    const code = await mailCode(page, raceEmail);
    let release!: () => void;
    let ready!: (pid: number) => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const locked = new Promise<number>(resolve => { ready = resolve; });
    const blocking = db.$transaction(async (tx: any) => {
      const [backend] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${account.id} FOR NO KEY UPDATE`;
      ready(backend.pid);
      await gate;
    }, { timeout: 20_000 });
    let updating: ReturnType<typeof context.request.patch> | undefined;
    try {
      const pid = await locked;
      updating = context.request.patch(`${api}/admin/users/${account.id}`, { data: { email: raceEmail } });
      await expect.poll(async () => {
        const [waiting] = await db.$queryRaw`SELECT count(*)::int AS count FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))`;
        return waiting.count;
      }).toBeGreaterThan(0);
      const verified = await claimantContext.request.post(`${api}/me/education/email/verify`, { data: { email: raceEmail, code } });
      expect(verified.ok(), await verified.text()).toBe(true);
      release();
      await blocking;
      expect((await updating).status()).toBe(400);
      expect((await db.user.findUniqueOrThrow({ where: { id: account.id } })).email).toBe(account.email);
      expect((await db.user.findUniqueOrThrow({ where: { id: concurrent.id } })).educationEmail).toBe(raceEmail);
    } finally {
      release();
      await Promise.allSettled([blocking, ...(updating ? [updating] : [])]);
    }
    await info.attach('education-mailbox-ownership', { contentType: 'application/json', body: JSON.stringify({ assertions: { visibleConflictRetainsDraft: true, ownerMayReuseMailbox: true, concurrentClaimRejectsStaleEdit: true, originalLoginPreserved: true } }) });
  } finally { await claimantContext.close(); }
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

test('expired admin refresh removes the previous private list', async ({ page, account, context, db }) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `expiry-${account.email}`, passwordHash: user.passwordHash, displayName: '会话验收管理员' } });
  expect((await context.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBeTruthy();
  await visit(page, '/admin/schools');
  await expect(page.getByText('自动化测试大学', { exact: true })).toBeVisible();
  await context.clearCookies();
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.getByText('自动化测试大学', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '进入后台', exact: true })).toBeVisible();
});

test('admin refresh preserves controls and late queries cannot replace new results', async ({ page, account, context, db }, testInfo) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `refresh-${account.email}`, passwordHash: user.passwordHash, displayName: '刷新验收管理员' } });
  expect((await context.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBeTruthy();
  await visit(page, '/admin/schools');
  const search = page.getByPlaceholder('搜索学校名称、slug 或邮箱域名…');
  await expect(search).toBeVisible();
  await expect(page.getByText('正在加载列表…', { exact: true })).toHaveCount(0);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  let obsoleteFinished!: () => void;
  const obsoleteHandled = new Promise<void>(resolve => { obsoleteFinished = resolve; });
  await page.route(`${api}/admin/schools?*`, async route => {
    const requestNumber = ++calls;
    if (requestNumber === 1) await gate;
    try {
      await route.fulfill({ json: { items: [], total: requestNumber === 1 ? 91 : 0, page: 1, pageSize: 20, totalPages: 1 } });
    } finally { if (requestNumber === 1) obsoleteFinished(); }
  });
  try {
    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await expect.poll(() => calls).toBe(1);
    await expect(search).toBeVisible();
    await search.fill('latest-query');
    await search.press('Enter');
    await expect.poll(() => calls).toBeGreaterThan(1);
    await expect(page.getByText('正在更新列表…', { exact: true })).toHaveCount(0);
    release();
    await obsoleteHandled;
    await expect(search).toHaveValue('latest-query');
    await expect(page.getByText('91', { exact: true })).toHaveCount(0);

  } finally { release(); }
});

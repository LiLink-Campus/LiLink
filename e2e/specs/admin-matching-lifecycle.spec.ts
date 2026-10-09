import { test, expect, api, password, visit, completeProfile } from '../support/fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// Drive real registration, solver preparation, reveal, snapshots and SMTP.
// No fixture creates a published match or advances the machine clock.
test('real matching preparation and reveal produce pages and Mailpit receipts @smoke', async ({ page, browser, context, account, db, signedIn }, info) => {
  test.setTimeout(120_000);
  void signedIn;
  await completeProfile(context, db);
  const source = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const peer = await db.user.create({ data: {
    email: `lifecycle-peer-${account.email}`, passwordHash: source.passwordHash,
    displayName: '合成撮合对象', status: 'ACTIVE', schoolId: source.schoolId,
  } });
  const peerContext = await browser.newContext({
    baseURL: process.env.E2E_WEB_URL, extraHTTPHeaders: { 'cf-connecting-ip': '2001:db8:142::2' },
  });
  const original = await db.matchCycle.findFirstOrThrow({ where: { status: 'OPEN' } });
  const cycle = await db.matchCycle.create({ data: {
    codename: `真实撮合验收-${account.id}`, status: 'DRAFT',
    participationDeadline: new Date(Date.now() + 3_600_000), revealAt: new Date(Date.now() + 7_200_000),
  } });
  const admin = await db.adminOperator.create({ data: { email: `lifecycle-operator-${account.email}`, passwordHash: source.passwordHash } });
  try {
    await db.matchCycle.update({ where: { id: original.id }, data: { status: 'DRAFT' } });
    expect((await context.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBe(true);
    const published = await context.request.put(`${api}/admin/cycles`, { data: {
      cycleId: cycle.id, codename: cycle.codename, status: 'OPEN',
      participationDeadline: cycle.participationDeadline.toISOString(), revealAt: cycle.revealAt.toISOString(),
    } });
    expect(published.ok()).toBe(true);
    expect((await peerContext.request.post(`${api}/auth/login`, { data: { email: peer.email, password } })).ok()).toBe(true);
    await completeProfile(peerContext, db);
    await db.user.update({ where: { id: peer.id }, data: { displayName: '合成撮合对象' } });
    const peerPage = await peerContext.newPage();
    for (const entry of [page, peerPage]) {
      await visit(entry, '/dashboard');
      await entry.getByRole('button', { name: '选择意向并报名', exact: true }).click();
      await entry.getByRole('dialog').getByRole('button', { name: /两者|都可以/ }).click();
      await expect(entry.getByRole('main').getByText('报名成功', { exact: true })).toBeVisible();
    }
    expect(await db.cycleParticipation.count({ where: { cycleId: cycle.id, status: 'OPTED_IN' } })).toBe(2);
    await db.matchCycle.update({ where: { id: cycle.id }, data: { participationDeadline: new Date(Date.now() - 1_000) } });
    const prepared = await context.request.post(`${api}/admin/cycles/run`, { data: { cycleId: cycle.id } });
    expect(prepared.ok(), await prepared.text()).toBe(true);
    expect((await prepared.json()).state).toBe('PREPARED');
    expect((await db.matchCycle.findUniqueOrThrow({ where: { id: cycle.id } })).status).toBe('REVEAL_READY');
    const matches = await db.match.findMany({ where: { cycleId: cycle.id }, include: { participants: true } });
    expect(matches).toHaveLength(1);
    expect(matches[0].revealedAt).toBeNull();
    expect(matches[0].participants.every((p: any) => p.profileSnapshot?.source === 'matching-preparation')).toBe(true);
    await db.matchCycle.update({ where: { id: cycle.id }, data: { revealAt: new Date(Date.now() - 1_000) } });
    const revealed = await context.request.post(`${api}/admin/cycles/run`, { data: { cycleId: cycle.id } });
    expect(revealed.ok(), await revealed.text()).toBe(true);
    expect((await revealed.json()).state).toBe('REVEALED');
    expect(await db.userCycleDashboardSnapshot.count({ where: { cycleId: cycle.id } })).toBe(2);
    expect((await db.match.findUniqueOrThrow({ where: { id: matches[0].id } })).introducedAt).not.toBeNull();
    const dedupeKeys = [0, 1].map(i => `match-reveal:${matches[0].id}:${i}`);
    await expect.poll(() => db.outboundEmail.count({ where: { dedupeKey: { in: dedupeKeys }, status: 'SENT' } }), { timeout: 40_000 }).toBe(2);
    for (const email of [source.email, peer.email]) {
      await expect.poll(async () => {
        const result = await context.request.get(`${process.env.E2E_MAIL_URL}/api/v1/search`, { params: { query: `to:${email}` } });
        return (await result.json()).messages?.filter((message: any) =>
          message.To?.some((recipient: any) => recipient.Address === email)).length ?? 0;
      }, { timeout: 40_000 }).toBe(1);
    }
    for (const [resultPage, partnerName] of [[page, '合成撮合对象'], [peerPage, '自动化同学']] as const) {
      await visit(resultPage, '/dashboard/match');
      const open = resultPage.getByRole('button', { name: '查看上一轮结果 →', exact: true });
      const partner = resultPage.getByRole('heading', { name: partnerName, level: 2, exact: true });
      await expect(partner).toHaveCount(0);
      await open.click();
      await expect(partner).toBeVisible();
      await expect(resultPage.getByRole('main')).toContainText('喜欢一起散步和读书。');
      await resultPage.getByRole('button', { name: '← 收起来信', exact: true }).click();
      await expect(partner).toHaveCount(0);
      await open.click();
      await expect(partner).toBeVisible();
      await resultPage.reload({ waitUntil: 'domcontentloaded' });
      await expect(partner).toHaveCount(0);
      await open.click();
      await expect(partner).toBeVisible();
    }

    const repeated = await context.request.post(`${api}/admin/cycles/run`, { data: { cycleId: cycle.id } });
    expect((await repeated.json()).state).toBe('SKIPPED');
    expect(await db.outboundEmail.count({ where: { dedupeKey: { in: dedupeKeys } } })).toBe(2);
    await visit(page, '/admin/cycles');
    await expect(page.getByText(cycle.codename, { exact: true })).toBeVisible();
    await info.attach('matching-lifecycle-contract', { contentType: 'application/json', body: JSON.stringify({
      project: info.project.name, assertions: { realOptIns: 2, solvedMatches: 1, snapshots: 2,
        introduced: true, sentOutbox: 2, receivedMailpit: 2, userResultVisible: true, repeatedRevealSkipped: true },
    }) });
  } finally {
    await peerContext.close();
    await db.matchCycle.delete({ where: { id: cycle.id } });
    await db.matchCycle.update({ where: { id: original.id }, data: { status: original.status } });
  }
});

test('admin login waits for its handlers before accepting input @smoke', async ({ page, account, context, db }, info) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `ready-${account.email}`,
    passwordHash: user.passwordHash, displayName: '登录验收管理员' } });
  let release!: () => void;
  const scriptsReady = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/_next/static/**/*.js', async route => {
    await scriptsReady;
    await route.continue();
  });
  try {
    await page.goto('/admin', { waitUntil: 'commit' });
    await expect(page.getByLabel('管理员邮箱', { exact: true })).toBeDisabled();
    await expect(page.getByLabel('密码', { exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '进入后台', exact: true })).toBeDisabled();
    release();
    await page.getByLabel('管理员邮箱', { exact: true }).fill(admin.email);
    await page.getByLabel('密码', { exact: true }).fill(password);
    await expect(page.getByLabel('管理员邮箱', { exact: true })).toHaveValue(admin.email);
    await page.getByRole('button', { name: '进入后台', exact: true }).click();
    await expect(page.getByRole('heading', { name: '运营概览', exact: true })).toBeVisible();
    await expect.poll(async () => (await context.request.get(`${api}/admin-session/me`)).status()).toBe(200);
    await info.attach('admin-login-ready', { contentType: 'application/json', body: JSON.stringify({
      project: info.project.name, assertions: { inputsUnavailableBeforeHandlers: true,
        emailPreservedWhileEnteringPassword: true, authenticatedOverviewVisible: true, adminSessionEstablished: true },
    }) });

  } finally {
    release();
    if (!page.isClosed()) await page.unrouteAll({ behavior: 'wait' });
  }
});

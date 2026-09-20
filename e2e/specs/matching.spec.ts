import { test, expect, api, visit, completeProfile } from '../support/fixtures';

test.beforeEach(async ({ signedIn }) => { void signedIn; });

test('join, reload, withdraw from current cycle @smoke', async ({ page, context, db, account }) => {
  await completeProfile(context, db);
  await visit(page, '/dashboard');
  await page.getByRole('button', { name: '选择意向并报名', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /两者|都可以/ }).click();
  await expect(page.getByRole('main').getByText('报名成功', { exact: true })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('main').getByText('报名成功', { exact: true })).toBeVisible();
  expect(await db.cycleParticipation.count({ where: { userId: account.id, status: 'OPTED_IN' } })).toBe(1);
  await page.getByRole('button', { name: '取消参与', exact: true }).click();
  await page.getByRole('button', { name: '确认取消报名', exact: true }).click();
  await expect(page.getByRole('main').getByText('尚未报名', { exact: true })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('main').getByText('尚未报名', { exact: true })).toBeVisible();
  expect(await db.cycleParticipation.count({ where: { userId: account.id, status: 'OPTED_IN' } })).toBe(0);
});

test('published match reveals the correct partner and survives reload @smoke', async ({ page, db, account }) => {
  const peer = await db.user.create({ data: { email: `peer-${account.email}`, displayName: '匹配对象小林', passwordHash: 'unusable', status: 'ACTIVE', schoolId: (await db.school.findUniqueOrThrow({ where: { slug: 'e2e-school' } })).id } });
  const cycle = await db.matchCycle.create({ data: {
    codename: `result-${account.id}`, status: 'REVEALED', participationDeadline: new Date(Date.now() - 120_000), revealAt: new Date(Date.now() - 60_000),
    participations: { create: [account, peer].map(user => ({ userId: user.id, status: 'OPTED_IN', intent: 'BOTH', optedInAt: new Date(Date.now() - 180_000) })) },
  } });
  try {
    await db.match.create({ data: { cycleId: cycle.id, score: 88, revealedAt: new Date(), introducedAt: new Date(), participants: { create: [account, peer].map((user, position) => ({ userId: user.id, cycleId: cycle.id, position })) } } });
    await visit(page, '/dashboard/match');
    await page.getByRole('button', { name: '打开来信，查看本轮匹配', exact: true }).click();
    await expect(page.getByRole('main').getByRole('heading', { name: '匹配对象小林', level: 2, exact: true })).toBeVisible();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('main').getByRole('heading', { name: '匹配对象小林', level: 2, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '打开来信，查看本轮匹配', exact: true })).toHaveCount(0);
  } finally { await db.matchCycle.delete({ where: { id: cycle.id } }); }
});

test('past deadline rejects joining even with a previously loaded page', async ({ page, context, db }) => {
  await completeProfile(context, db);
  const cycle = await db.matchCycle.findFirstOrThrow({ where: { status: 'OPEN' } });
  await visit(page, '/dashboard');
  await page.getByRole('button', { name: '选择意向并报名', exact: true }).click();
  try {
    await db.matchCycle.update({ where: { id: cycle.id }, data: { participationDeadline: new Date(Date.now() - 1000) } });
    const response = page.waitForResponse(response => response.url().endsWith('/me/participation') && response.request().method() === 'PUT');
    await page.getByRole('dialog').getByRole('button', { name: /两者|都可以/ }).click();
    expect((await response).ok()).toBeFalsy();
    await expect(page.getByRole('main').getByText(/截止|锁定/).first()).toBeVisible();
  } finally { await db.matchCycle.update({ where: { id: cycle.id }, data: { participationDeadline: cycle.participationDeadline, status: cycle.status } }); }
});

test('unmatched published cycle shows a clear result instead of an empty page', async ({ page, db, account, isMobile }, testInfo) => {
  const cycle = await db.matchCycle.create({ data: {
    codename: `unmatched-${account.id}`, status: 'REVEALED',
    participationDeadline: new Date(Date.now() - 120_000), revealAt: new Date(Date.now() - 60_000),
    participations: { create: { userId: account.id, status: 'OPTED_IN', intent: 'BOTH', optedInAt: new Date(Date.now() - 180_000) } },
  } });
  try {
    await visit(page, '/dashboard/match');
    await expect(page.getByRole('heading', { name: '本轮未匹配到对象', exact: true })).toBeVisible();
    const action = page.getByRole('link', { name: '去完善匹配资料', exact: true });
    await expect(action).toBeVisible();
    await action.scrollIntoViewIfNeeded();
    await expect(action).toBeInViewport({ ratio: 1 });
    if (!isMobile) {
      for (const width of [879, 880, 1280]) {
        await page.setViewportSize({ width, height: 720 });
        await action.scrollIntoViewIfNeeded();
        await expect(action).toBeInViewport({ ratio: 1 });
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`unmatched-${width}.png`), fullPage: true });
      }
    }
    await action.click();
    await expect(page).toHaveURL(/\/dashboard\/profile$/);
  } finally { await db.matchCycle.delete({ where: { id: cycle.id } }); }
});

import { randomUUID } from 'node:crypto';
import { test, expect, api, password, visit } from '../support/fixtures';
import { IsrWriteEvidence, sha256 } from '../support/isr-write-evidence';

// Failure boundaries: changes to non-displayed cycle fields must preserve the
// actual cached HTML and receiver budget, while public landing keeps those fields.
// Equal school names/counts must remain deterministic across insertion order.
test('hidden cycle changes preserve visible homepage and cached bytes @smoke', async ({ page, context, db, account }, info) => {
  test.setTimeout(110_000);
  const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: {
    email: `projection-${account.email}`, passwordHash: user.passwordHash,
  } });
  expect((await context.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBe(true);
  const cycle = await db.matchCycle.findFirstOrThrow({ where: { status: 'OPEN' } });
  const original = { cycleId: cycle.id, codename: cycle.codename, status: cycle.status,
    participationDeadline: cycle.participationDeadline.toISOString(), revealAt: cycle.revealAt.toISOString() };
  const evidence = new IsrWriteEvidence(info.outputPath('visible-projection-cache'));
  const save = async (data: typeof original) => expect((await context.request.put(`${api}/admin/cycles`, { data })).ok()).toBe(true);
  const drain = async (data: typeof original) => {
    // Only the isolated runner's pending clocks are advanced, after lease release.
    await expect.poll(async () => {
      const row = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
      if (row.leaseUntil && row.leaseUntil.getTime() > Date.now()) return false;
      const updated = await db.publicCacheInvalidation.updateMany({ where: {
        scope: 'home', revision: row.revision,
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }],
      }, data: { dueAt: new Date(0), lastAttemptAt: null, lastClaimedAt: new Date(0) } });
      return updated.count === 1;
    }, { timeout: 35_000, intervals: [100, 250, 500] }).toBe(true);
    await save(data);
    await expect.poll(async () => {
      const row = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
      return row.acknowledgedRevision >= row.revision && row.leaseToken === null;
    }, { timeout: 30_000, intervals: [100, 250, 500] }).toBe(true);
  };
  let mutationSaved = false;
  await evidence.start();
  try {
    await drain(original);
    const upstream = await (await context.request.get(`${api}/public/landing`)).json();
    await expect.poll(async () => {
      const response = await page.request.get('/');
      const html = await response.text();
      return response.headers()['x-nextjs-cache'] === 'HIT' && html.includes(cycle.revealAt.toISOString());
    }, { timeout: 20_000, intervals: [100, 250, 500] }).toBe(true);
    await visit(page, '/');
    const stats = page.getByRole('region', { name: '平台数据' });
    await expect(stats.locator('strong').nth(0)).toHaveText(String(upstream.stats.registeredUsers));
    await expect(stats.locator('strong').nth(1)).toHaveText(String(upstream.stats.completedQuestionnaires));
    const visibleBefore = await stats.innerText();
    const revealBefore = await page.locator('time[datetime]').first().getAttribute('datetime');
    await evidence.quiet();
    const before = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    const initial = sha256(await (await page.request.get('/')).body());
    await evidence.mark('hidden-cycle-change');
    const changed = { ...original, codename: `仅内部代号-${randomUUID().slice(0, 8)}`,
      participationDeadline: new Date(cycle.participationDeadline.getTime() - 60_000).toISOString() };
    await save(changed); mutationSaved = true;
    const pending = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    expect(pending.revision > before.revision).toBe(true);
    await drain(changed);
    const after = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    expect(after.deliveredHash).toBe(before.deliveredHash);
    expect(after.claimedRevision).toBe(before.claimedRevision);
    expect(after.lastDeliveredAt?.toISOString()).toBe(before.lastDeliveredAt?.toISOString());
    const landing = await (await context.request.get(`${api}/public/landing`)).json();
    expect(landing.currentCycle.codename).toBe(changed.codename);
    expect(landing.currentCycle.participationDeadline).toBe(changed.participationDeadline);
    for (let i = 0; i < 5; i++) {
      const response = await page.request.get('/');
      expect(response.headers()['x-nextjs-cache']).toBe('HIT');
      expect(sha256(await response.body())).toBe(initial);
    }
    await page.reload();
    await expect.poll(() => stats.innerText()).toBe(visibleBefore);
    expect(await page.locator('time[datetime]').first().getAttribute('datetime')).toBe(revealBefore);
    await evidence.quiet();
    expect(evidence.versions.filter(row => row.phase === 'hidden-cycle-change')).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath('hidden-cycle-change-preserved-home.png'), fullPage: true });
    await info.attach('visible-projection-contract', { contentType: 'application/json', body: JSON.stringify({
      project: info.project.name, assertions: { publicLandingContractPreserved: true,
        hiddenChangeAcknowledged: true, receiverBudgetPreserved: true,
        cachedBytesPreserved: true, visibleStatsAndRevealPreserved: true },
      evidence: await evidence.summarize(),
    }, null, 2) });
  } finally {
    await evidence.stop();
    if (mutationSaved) { await save(original); await drain(original); }
  }
  expect(evidence.errors).toEqual([]);
});

test('school directory and homepage order equal names and counts by stable id @smoke', async ({ page, context, db, account }, info) => {
  test.setTimeout(90_000);
  const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: {
    email: `school-order-${account.email}`, passwordHash: user.passwordHash,
  } });
  expect((await context.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBe(true);
  const suffix = randomUUID().slice(0, 8);
  const ids = [`e2e-a-${suffix}`, `e2e-z-${suffix}`];
  const name = `同名排序验收学校-${suffix}`;
  const created: string[] = [];
  try {
    for (const id of [...ids].reverse()) {
      await db.school.create({ data: { id, slug: id, name,
        domains: { create: { domain: `${id}.example.test` } } } });
      created.push(id);
      expect((await context.request.put(`${api}/admin/schools/${id}`, { data: {
        name, registrationEligible: true, domains: [`${id}.example.test`],
      } })).ok()).toBe(true);
    }
    const directory = await (await context.request.get(`${api}/public/schools`)).json();
    expect(directory.schools.filter((school: { name: string }) => school.name === name)
      .map((school: { id: string }) => school.id)).toEqual(ids);
    const community = await (await context.request.get(`${api}/public/community`)).json();
    expect(community.schools.filter((school: { name: string }) => school.name === name)
      .map((school: { id: string }) => school.id)).toEqual(ids);
    const cycle = await db.matchCycle.findFirstOrThrow({ where: { status: 'OPEN' } });
    await expect.poll(async () => {
      const row = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
      if (row.leaseUntil && row.leaseUntil.getTime() > Date.now()) return false;
      return (await db.publicCacheInvalidation.updateMany({ where: { scope: 'home', revision: row.revision,
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }],
      }, data: { dueAt: new Date(0), lastAttemptAt: null, lastClaimedAt: new Date(0) } })).count === 1;
    }, { timeout: 35_000, intervals: [100, 250, 500] }).toBe(true);
    expect((await context.request.put(`${api}/admin/cycles`, { data: {
      cycleId: cycle.id, codename: cycle.codename, status: cycle.status,
      participationDeadline: cycle.participationDeadline.toISOString(), revealAt: cycle.revealAt.toISOString(),
    } })).ok()).toBe(true);
    await expect.poll(async () => {
      const row = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
      return row.acknowledgedRevision >= row.revision && row.leaseToken === null;
    }, { timeout: 30_000, intervals: [100, 250, 500] }).toBe(true);
    await expect.poll(async () => (await (await page.request.get('/')).text()).includes(name),
      { timeout: 20_000, intervals: [100, 250, 500] }).toBe(true);
    await visit(page, '/');
    const schools = page.getByRole('list', { name: '各学校已加入人数' });
    await expect(schools.getByText(name, { exact: false })).toHaveCount(2);
    await expect(schools).toBeVisible();
    await page.screenshot({ path: info.outputPath('equal-school-order.png'), fullPage: true });
    await info.attach('stable-school-order-contract', { contentType: 'application/json', body: JSON.stringify({
      project: info.project.name, assertions: { reverseInsertionSortedById: true,
        directoryAndCommunityAgree: true, bothSchoolRowsVisible: true },
    }, null, 2) });
  } finally {
    for (const id of created) expect((await context.request.delete(`${api}/admin/schools/${id}`)).ok()).toBe(true);
  }
});

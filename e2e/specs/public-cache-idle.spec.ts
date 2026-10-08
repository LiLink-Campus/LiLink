import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect, api, password, visit } from '../support/fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// Default wall-clock evidence, deliberately separate from accelerated faults.
// No user/health/DB probes reach the API during the idle observation; the pg
// observer emits timing/category only. Test DB reads are not application SQL.
test('two full default idle windows and automatic SWR publication', async ({ page, context, db, account }, info) => {
  test.skip(process.env.E2E_BACKGROUND_EVIDENCE !== '1', 'Requires --background-evidence and its sanitized SQL observer.');
  test.setTimeout(75 * 60_000);
  const output = process.env.E2E_OUTPUT!;
  const timelineFile = path.join(output, 'application-sql.jsonl');
  const events = async (): Promise<Array<{ at: number; category: string }>> =>
    (await readFile(timelineFile, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  const row = () => db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
  const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `idle-${account.email}`, passwordHash: user.passwordHash,
    displayName: '后台任务验收管理员' } });
  expect((await context.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBe(true);
  const cycle = await db.matchCycle.findFirstOrThrow({ where: { status: 'OPEN' } });
  const cycleData = { cycleId: cycle.id, codename: cycle.codename, status: cycle.status,
    revealAt: cycle.revealAt.toISOString(), participationDeadline: cycle.participationDeadline.toISOString() };
  await db.publicCacheInvalidation.updateMany({ data: { dueAt: new Date(0), lastAttemptAt: null,
    lastClaimedAt: new Date(0), lastVerificationAt: null, verificationFailures: 0 } });
  expect((await context.request.put(`${api}/admin/cycles`, { data: cycleData })).ok()).toBe(true);
  await expect.poll(async () => {
    const current = await row();
    return current.acknowledgedRevision === current.revision && current.verificationCompletedRevision === current.acknowledgedRevision
      && current.verificationOutcome === 'verified';
  }, { timeout: 660_000, intervals: [1000] }).toBe(true);
  const interval = 900_000;
  // The real mail activity window is fifteen minutes from process startup.
  const start = (Math.floor(Math.max(Date.now(), (await events())[0].at + 16 * 60_000) / interval) + 1) * interval;
  const end = start + 2 * interval + 3000;
  while (Date.now() < end) {
    await new Promise(resolve => setTimeout(resolve, Math.min(50_000, end - Date.now())));
    console.log(`Default idle observation: ${Math.max(0, Math.round((end - Date.now()) / 1000))} seconds remaining.`);
  }
  const idle = (await events()).filter(event => event.at >= start && event.at <= end);
  const windows = [0, 1].map(index => {
    const boundary = start + index * interval;
    const queries = idle.filter(event => event.at >= boundary && event.at < boundary + interval);
    expect(queries.some(event => event.category === 'cache')).toBe(true);
    expect(queries.some(event => event.category === 'mail')).toBe(true);
    expect(queries.every(event => event.at - boundary < 15_000)).toBe(true);
    const quietMs = boundary + interval - Math.max(...queries.map(event => event.at));
    expect(quietMs).toBeGreaterThan(300_000);
    return { boundary, queryCount: queries.length, quietMs, categories: [...new Set(queries.map(event => event.category))] };
  });
  // A real urgent business change just after idle must start without fallback.
  const changed = new Date(cycle.revealAt.getTime() + 7200_000).toISOString();
  const mutationAt = Date.now();
  expect((await context.request.put(`${api}/admin/cycles`, { data: { ...cycleData, revealAt: changed } })).ok()).toBe(true);
  await expect.poll(async () => (await row()).lastDeliveredAt?.getTime() ?? 0,
    { timeout: 20_000, intervals: [250] }).toBeGreaterThanOrEqual(mutationAt);
  const acknowledged = await row();
  // No page reads or new requests while the worker performs the SWR read and
  // waits its real five-minute gate. The second probe must complete automatically.
  await expect.poll(async () => {
    const current = await row();
    return current.verificationCompletedRevision === acknowledged.acknowledgedRevision && current.verificationOutcome === 'verified';
  }, { timeout: 660_000, intervals: [1000] }).toBe(true);
  const complete = await row();
  await visit(page, '/');
  await expect(page.getByRole('main').locator('time[datetime]').filter({ visible: true }).first()).toHaveAttribute('datetime', changed);
  await page.screenshot({ path: info.outputPath('automatic-publication.png'), fullPage: true });
  const evidence = { command: 'node scripts/e2e/run.mjs --background-evidence public-cache-idle.spec.ts --project=chromium',
    clock: 'Real default periods; no clock acceleration or deadline edits during assertion',
    start, end, windows, idleApplicationSql: idle, mutationAt, acknowledgedAt: acknowledged.lastDeliveredAt,
    completedAt: complete.lastVerificationAt, completedRevision: complete.verificationCompletedRevision.toString(),
    actualPageVisible: true, productionBilling: 'UNKNOWN' };
  await writeFile(path.join(output, 'public-cache-idle.json'), JSON.stringify(evidence, null, 2));
  await info.attach('background-default-periods', { contentType: 'application/json', body: JSON.stringify(evidence) });
});

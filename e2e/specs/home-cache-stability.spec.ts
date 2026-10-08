import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { readdir } from 'node:fs/promises';
import net from 'node:net';

import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizePublicHomeSnapshot } from '@lilink/shared';
import { test, expect, api, password, visit } from '../support/fixtures';
import { homeCacheFiles } from '../support/home-cache-files';

const webhook = '/api/internal/public-cache/revalidate';
const hash = (body: string | Buffer) => createHash('sha256').update(body).digest('hex');
const signed = (body: string, timestamp = Math.floor(Date.now() / 1000).toString()) => ({
  'content-type': 'application/json',
  'x-lilink-timestamp': timestamp,
  'x-lilink-signature': createHmac('sha256', process.env.PUBLIC_CACHE_REVALIDATION_SECRET!)
    .update(`${timestamp}.${body}`).digest('hex'),
});

// Failure boundaries: unauthorized, expired, malformed, oversized and arbitrary
// scope requests must not invalidate cached pages. Only fixed public scopes exist.
test('public cache invalidation rejects unauthorized and invalid requests @smoke', async ({ request }, info) => {
  const body = JSON.stringify({ scope: 'home', revision: '1' });
  const samples = [];
  for (const [name, data, headers] of [
    ['unsigned', body, { 'content-type': 'application/json' }],
    ['wrong-signature', body, { ...signed(body), 'x-lilink-signature': '0'.repeat(64) }],
    ['expired', body, signed(body, Math.floor(Date.now() / 1000 - 600).toString())],
    ['unknown-scope', JSON.stringify({ scope: '/admin', revision: '1' }), null],
    ['invalid-revision', JSON.stringify({ scope: 'home', revision: 'invalid' }), null],
    ['malformed-json', '{', null],
    ['oversized', JSON.stringify({ scope: 'home', revision: '1', payload: 'x'.repeat(1100) }), null],
  ] as const) {
    const response = await request.post(webhook, { data, headers: headers ?? signed(data) });
    expect(response.status(), name).toBeGreaterThanOrEqual(400);
    expect(response.status(), name).toBeLessThan(500);
    samples.push({ name, status: response.status() });
  }
  await info.attach('invalidation-boundary', { contentType: 'application/json', body: JSON.stringify(samples, null, 2) });
});

// Failure boundaries: direct live reads must never shorten the full-page cache;
// pending earlier notifications and SWR must finish before the hash baseline.
// Setup must not discard revisions, steal active leases, or relax HIT/hash checks.
// Unchanged pages stay HIT beyond the former 30-second expiry without changing Sentry.
test('live API reads leave the long cached homepage unchanged @smoke', async ({ page, db, account }, info) => {
  test.setTimeout(180_000);
  const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `stable-cache-${account.email}`,
    passwordHash: user.passwordHash } });
  expect((await page.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBe(true);
  const cycle = await db.matchCycle.findFirstOrThrow({ where: { status: 'OPEN' } });
  const unchangedCycle = { cycleId: cycle.id, codename: cycle.codename, status: cycle.status,
    revealAt: cycle.revealAt.toISOString(), participationDeadline: cycle.participationDeadline.toISOString() };
  await expect.poll(async () => {
    const row = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    if (row.leaseUntil && row.leaseUntil.getTime() > Date.now()) return false;
    if (row.revision <= row.acknowledgedRevision) return true;
    const advanced = await db.publicCacheInvalidation.updateMany({ where: {
      scope: 'home', revision: row.revision,
      OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }],
    }, data: { dueAt: new Date(0), lastAttemptAt: null, lastClaimedAt: new Date(0) } });
    if (advanced.count) expect((await page.request.put(`${api}/admin/cycles`, { data: unchangedCycle })).ok()).toBe(true);
    return false;
  }, { timeout: 65_000, intervals: [250, 500] }).toBe(true);
  let first = '';
  await expect.poll(async () => {
    const live = await page.request.get(`${api}/public/home`);
    expect(live.ok()).toBe(true);
    const expected = hash(JSON.stringify(normalizePublicHomeSnapshot(await live.json())));
    const response = await page.request.get('/');
    first = await response.text();
    return response.headers()['x-nextjs-cache'] === 'HIT'
      && first.includes(`data-lilink-home-fingerprint="v1:${expected}"`);
  }, { timeout: 20_000, intervals: [250, 500] }).toBe(true);
  expect(first).toContain('各学校已加入人数');
  expect(first).not.toContain('generatedAt');
  const samples = [];
  const started = Date.now();
  while (Date.now() - started < 36_000) {
    const live = await page.request.get(`${api}/public/home`);
    expect(live.ok()).toBe(true);
    const response = await page.request.get('/');
    const html = await response.text();
    expect(response.headers()['x-nextjs-cache']).toBe('HIT');
    expect(hash(html)).toBe(hash(first));
    samples.push({ elapsedMs: Date.now() - started, cache: response.headers()['x-nextjs-cache'], htmlSha256: hash(html) });
    await new Promise(resolve => setTimeout(resolve, 6_000));
  }
  await info.attach('long-cache-isolation', { contentType: 'application/json', body: JSON.stringify({
    project: info.project.name, samples, assertions: { directLiveReadsDoNotInvalidatePage: true, old30SecondExpiryExceeded: true },
  }, null, 2) });
});

// Failure boundaries: a committed admin change must refresh API memory, durable
// notification state and server-rendered HTML; the visible countdown and CTA
// must agree. A worker lost after its sixth claim must remain exhausted after
// recovery, while a new business change reactivates delivery. Hidden streamed
// Suspense copies cannot establish visibility.
test('admin cycle change invalidates server snapshot through the durable dispatcher @smoke', async ({ page, context, db, account }, info) => {
  test.setTimeout(100_000);
  const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `cache-${account.email}`, passwordHash: user.passwordHash, displayName: '缓存验收管理员' } });
  const cycle = await db.matchCycle.findFirstOrThrow({ where: { status: 'OPEN' } });
  const before = await db.publicCacheInvalidation.findUnique({ where: { scope: 'home' } });
  const cycleData = { cycleId: cycle.id, codename: cycle.codename, status: cycle.status,
    participationDeadline: cycle.participationDeadline.toISOString(), revealAt: cycle.revealAt.toISOString() };
  let setupStarted = false;
  let primaryFailure = false;
  try {
    await visit(page, '/admin');
    await page.getByLabel('管理员邮箱', { exact: true }).fill(admin.email);
    await page.getByLabel('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: '进入后台', exact: true }).click();
    await expect.poll(async () => (await context.request.get(`${api}/admin-session/me`)).status()).toBe(200);
    setupStarted = true;
    // Recreate a worker lost after its final durable claim without changing
    // the production retry budget or stealing a live lease.
    let lostWorker: { acknowledgedRevision: bigint; claimedRevision: bigint } | undefined;
    await expect.poll(async () => {
      const row = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
      const prepared = await db.publicCacheInvalidation.updateMany({ where: {
        scope: 'home', revision: row.revision,
        acknowledgedRevision: row.acknowledgedRevision, claimedRevision: row.claimedRevision,
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }],
      }, data: {
        revision: { increment: 1 }, attempts: 6, exhaustedAt: null,
        dueAt: new Date(0), lastAttemptAt: new Date(0),
        leaseUntil: new Date(0), leaseToken: randomUUID(),
      } });
      if (prepared.count !== 1) return false;
      lostWorker = row;
      return true;
    }, { timeout: 35_000, intervals: [250, 500] }).toBe(true);
    expect((await context.request.put(`${api}/admin/cycles`, { data: {
      cycleId: cycle.id, codename: cycle.codename, status: cycle.status,
      participationDeadline: cycle.participationDeadline.toISOString(), revealAt: cycle.revealAt.toISOString(),
    } })).ok()).toBe(true);
    await expect.poll(async () => {
      const row = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
      return row.exhaustedAt !== null && row.leaseToken === null;
    }, { timeout: 15_000, intervals: [100, 250, 500] }).toBe(true);
    const exhausted = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    expect(exhausted.attempts).toBe(6);
    expect(exhausted.acknowledgedRevision).toBe(lostWorker!.acknowledgedRevision);
    expect(exhausted.claimedRevision).toBe(lostWorker!.claimedRevision);
    await info.attach('lost-worker-retry-budget', { contentType: 'application/json', body: JSON.stringify({
      attempts: exhausted.attempts, exhausted: exhausted.exhaustedAt !== null,
      assertions: { expiredFinalClaimDidNotRetry: true, noAdditionalReceiverClaim: true },
    }, null, 2) });
    await visit(page, '/admin/cycles');
    await page.getByRole('button', { name: '编辑轮次', exact: true }).click();
    await page.getByRole('combobox', { name: '状态', exact: true }).selectOption('DRAFT');
    await page.getByRole('button', { name: '保存轮次', exact: true }).click();
    await expect.poll(async () => (await db.matchCycle.findUniqueOrThrow({ where: { id: cycle.id } })).status).toBe('DRAFT');
    const pending = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    expect(pending.revision > (before?.revision ?? 0n)).toBe(true);
    expect(pending.urgent).toBe(true);
    expect(pending.exhaustedAt).toBeNull();
    expect(pending.attempts).toBe(0);
    // Only the disposable queue clock is advanced; production intervals stay intact.
    await db.publicCacheInvalidation.update({ where: { scope: 'home' }, data: {
      dueAt: new Date(0), lastAttemptAt: null, leaseUntil: null, lastClaimedAt: new Date(0),
    } });
    // Reschedule after advancing the DB clock, without creating another event.
    expect((await context.request.put(`${api}/admin/cycles`, { data: { ...cycleData, status: 'DRAFT' } })).ok()).toBe(true);
    expect((await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } })).revision).toBe(pending.revision);
    await expect.poll(async () => {
      const row = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
      return row.acknowledgedRevision >= pending.revision && row.lastDeliveredAt !== null;
    }, { timeout: 25_000, intervals: [500, 1000] }).toBe(true);
    await expect.poll(async () => {
      const response = await page.request.get('/');
      const html = await response.text();
      return html.includes('轮次时间待配置') && !html.includes(cycle.revealAt.toISOString());
    }, { timeout: 20_000, intervals: [500, 1000] }).toBe(true);
    await visit(page, '/');
    const main = page.getByRole('main');
    const countdown = main.getByText('轮次时间待配置', { exact: true }).filter({ visible: true });
    const joinMessage = main.getByText('完成匹配资料，准备下一次校园里的认真相遇。', { exact: true }).filter({ visible: true });
    await expect(countdown).toHaveCount(1);
    await expect(countdown).toBeVisible();
    await expect(joinMessage).toHaveCount(1);
    await expect(joinMessage).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const delivered = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    await info.attach('business-invalidation', { contentType: 'application/json', body: JSON.stringify({
      project: info.project.name, pendingRevision: pending.revision.toString(),
      acknowledgedRevision: delivered.acknowledgedRevision.toString(), attempts: delivered.attempts,
      assertions: { adminUiSaved: true, queueCommitted: true, actualDispatcherDelivered: true,
        serverHtmlUpdated: true, browserUpdated: true, visibleJoinCtaUpdated: true },
    }, null, 2) });
  } catch (error) {
    primaryFailure = true;
    throw error;
  } finally {
    try {
      if (setupStarted) {
        expect((await context.request.put(`${api}/admin/cycles`, { data: cycleData })).ok()).toBe(true);
        const cleanup = await db.publicCacheInvalidation.update({ where: { scope: 'home' }, data: {
          dueAt: new Date(0), lastAttemptAt: null, leaseUntil: null, lastClaimedAt: new Date(0),
        } });
        expect((await context.request.put(`${api}/admin/cycles`, { data: cycleData })).ok()).toBe(true);
        expect((await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } })).revision).toBe(cleanup.revision);
        const body = JSON.stringify({ scope: 'home', revision: cleanup.revision.toString() });
        expect((await context.request.post(webhook, { data: body, headers: signed(body) })).ok()).toBe(true);
      }
    } catch (error) {
      if (!primaryFailure) throw error;
      info.annotations.push({ type: 'cache-cleanup-failure',
        description: 'Cleanup also failed; the original test failure is retained. See the trace.' });
    }
  }
});

// Failure boundaries: rollback must also roll back the pending event; bursts of
// ordinary writes increase the revision while retaining their original due time.
// A previous dispatch must finish before comparing the queue's due time; its
// receiver claim legitimately moves the next permitted publication window.
test('transactional cache notifications roll back and coalesce membership bursts @smoke', async ({ db }, info) => {
  const school = await db.school.findUniqueOrThrow({ where: { slug: 'e2e-school' } });
  const data = () => ({ email: `${randomUUID()}@school.example.test`, passwordHash: 'synthetic-unused',
    displayName: '事务验收同学', status: 'ACTIVE', schoolId: school.id, isTest: false, acceptedTermsAt: new Date() });
  let originalDueAt: Date | undefined;
  const users: string[] = [];
  // Defer only this disposable queue's clock. Keep its revisions and existing
  // lease owner intact; an earlier dispatcher snapshot cannot claim a future row.
  await expect.poll(async () => {
    const row = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    const deferred = await db.publicCacheInvalidation.updateMany({ where: {
      scope: 'home', revision: row.revision,
      OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }],
    }, data: { dueAt: new Date(Date.now() + 3_600_000) } });
    if (deferred.count === 1) originalDueAt = row.dueAt;
    return deferred.count;
  }, { timeout: 35_000, intervals: [100, 250, 500] }).toBe(1);
  try {
    const before = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    await expect(db.$transaction(async (tx: any) => {
      await tx.user.create({ data: data() });
      throw new Error('synthetic-rollback');
    })).rejects.toThrow('synthetic-rollback');
    const rolledBack = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    expect(rolledBack.revision).toBe(before.revision);
    users.push((await db.user.create({ data: data() })).id);
    const pending = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    users.push((await db.user.create({ data: data() })).id);
    const coalesced = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    expect(coalesced.revision).toBe(pending.revision + 1n);
    expect(coalesced.dueAt.toISOString()).toBe(pending.dueAt.toISOString());
    await info.attach('transactional-coalescing', { contentType: 'application/json', body: JSON.stringify({
      project: info.project.name, pendingDueAt: pending.dueAt, coalescedDueAt: coalesced.dueAt,
      assertions: { previousDispatcherSettled: true, rollbackPreservesRevision: true, membershipBurstCoalesced: true },
    }, null, 2) });
  } finally {
    await db.user.deleteMany({ where: { id: { in: users } } });
    await db.publicCacheInvalidation.update({ where: { scope: 'home' }, data: { dueAt: originalDueAt } });
  }
});

// Failure boundary: a legitimate invalidation during a real upstream outage must
// keep the last server-rendered snapshot, then recover once the isolated API resumes.
test('upstream outage during revalidation preserves the last server snapshot @smoke', async ({ page, db }, info) => {
  test.setTimeout(60_000);
  const apiPid = Number(process.env.E2E_API_PID);
  expect(Number.isInteger(apiPid) && apiPid > 1).toBe(true);
  // A preceding mutation can leave SWR in flight. Freeze only after the route
  // is HIT and its route/data files are quiet, so an old regeneration cannot
  // finish after SIGSTOP and mask the outage this test is meant to exercise.
  let baselineFiles: Awaited<ReturnType<typeof homeCacheFiles>>;
  await expect.poll(async () => {
    const response = await page.request.get('/');
    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain('各学校已加入人数');
    if (response.headers()['x-nextjs-cache'] !== 'HIT') return false;
    baselineFiles = await homeCacheFiles();
    await new Promise(resolve => setTimeout(resolve, 1000));
    return JSON.stringify(await homeCacheFiles()) === JSON.stringify(baselineFiles);
  }, { timeout: 15_000, intervals: [250, 500] }).toBe(true);
  // Claim while API is available, then fail only the actual upstream read. A
  // duplicate revision or unavailable claim would never exercise regeneration.
  const prepared = await db.publicCacheInvalidation.update({ where: { scope: 'home' }, data: {
    revision: { increment: 1 }, lastClaimedAt: new Date(0),
    dueAt: new Date(Date.now() + 3_600_000),
  } });
  const body = JSON.stringify({ scope: 'home', revision: prepared.revision.toString() });
  const notification = await page.request.post(webhook, { data: body, headers: signed(body) });
  expect(notification.status()).toBe(200);
  expect((await notification.json()).invalidated).toBe(true);
  const logPath = path.join(process.env.E2E_OUTPUT!, 'web.log');
  const logOffset = (await readFile(logPath, 'utf8')).length;
  let outageStatus = 0;
  let unavailableClaimStatus = 0;
  try {
    // The runner owns this process and reaps it if the test itself is interrupted.
    process.kill(apiPid, 'SIGSTOP');
    const unavailableClaim = await page.request.post(webhook, { data: body, headers: signed(body) });
    unavailableClaimStatus = unavailableClaim.status();
    expect(unavailableClaimStatus).toBe(503);
    expect((await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } })).claimedRevision).toBe(prepared.revision);
    // Trigger SWR, then keep the API unavailable until regeneration really fails.
    expect((await page.request.get('/', { timeout: 20_000 })).ok()).toBe(true);
    await expect.poll(async () => (await readFile(logPath, 'utf8')).slice(logOffset)
      .includes('[public-data] /public/home: timeout'), { timeout: 20_000, intervals: [500, 1000] }).toBe(true);
    const response = await page.request.get('/', { timeout: 20_000 });
    outageStatus = response.status();
    expect(response.ok()).toBe(true);
    const html = await response.text();
    expect(html).toContain('各学校已加入人数');
    expect(html).not.toContain('平台数据暂时不可用');
  } finally {
    process.kill(apiPid, 'SIGCONT');
  }
  await expect.poll(async () => {
    try { return (await page.request.get(`${api}/health`, { timeout: 2000 })).ok(); }
    catch { return false; }
  }, { timeout: 10_000, intervals: [250, 500, 1000] }).toBe(true);
  await db.publicCacheInvalidation.update({ where: { scope: 'home' }, data: {
    dueAt: new Date(0), lastAttemptAt: null, leaseUntil: null,
  } });
  const recovered = await page.request.get('/');
  expect(recovered.ok()).toBe(true);
  expect(await recovered.text()).toContain('各学校已加入人数');
  await info.attach('upstream-outage', { contentType: 'application/json', body: JSON.stringify({
    project: info.project.name, outageStatus, unavailableClaimStatus,
    assertions: { actualUpstreamSuspended: true, claimedBeforeUpstreamSuspension: true,
      unavailableClaimRejected: true, oldServerSnapshotServed: true, recoveredAfterResume: true },
  }, null, 2) });
});

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

    const before = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    const initial = hash(await (await page.request.get('/')).body());
    const cacheFiles = await homeCacheFiles();
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
      expect(hash(await response.body())).toBe(initial);
    }
    await page.reload();
    await expect.poll(() => stats.innerText()).toBe(visibleBefore);
    expect(await page.locator('time[datetime]').first().getAttribute('datetime')).toBe(revealBefore);

    expect(await homeCacheFiles()).toEqual(cacheFiles);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await info.attach('visible-projection-contract', { contentType: 'application/json', body: JSON.stringify({
      project: info.project.name, assertions: { publicLandingContractPreserved: true,
        hiddenChangeAcknowledged: true, receiverBudgetPreserved: true,
        cachedBytesPreserved: true, visibleStatsAndRevealPreserved: true },

    }, null, 2) });
  } finally {

    if (mutationSaved) { await save(original); await drain(original); }
  }

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

    await info.attach('stable-school-order-contract', { contentType: 'application/json', body: JSON.stringify({
      project: info.project.name, assertions: { reverseInsertionSortedById: true,
        directoryAndCommunityAgree: true, bothSchoolRowsVisible: true },
    }, null, 2) });
  } finally {
    for (const id of created) expect((await context.request.delete(`${api}/admin/schools/${id}`)).ok()).toBe(true);
  }
});

// Failure boundaries: a successful claim can precede a lost invalidation. A
// delivery acknowledgment is not proof of published content. Verification must
// read the real cached HTML, preserve the rate gate, and repair an acknowledged
// stale page. Equal published content must not enqueue work or change HTML.
// Unauthenticated control requests cannot read or mutate publication state.
test('publication verification repairs an acknowledged stale homepage @smoke', async ({ page, db, account }, info) => {
  test.setTimeout(180_000);
  const request = page.request;
  const body = JSON.stringify({ scope: 'home' });
  const verify = async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    return request.post(`${api}/internal/public-cache/verify`, { data: body, headers: {
      'content-type': 'application/json', 'x-lilink-timestamp': timestamp,
      'x-lilink-signature': createHmac('sha256', process.env.PUBLIC_CACHE_REVALIDATION_SECRET!)
        .update(`${timestamp}.${body}`).digest('hex'),
    } });
  };
  const fingerprint = (html: string) => html.match(/data-lilink-home-fingerprint="v1:([a-f0-9]{64})"/)?.[1];
  const digest = (html: string) => createHash('sha256').update(html).digest('hex');
  const due = () => expect.poll(async () => (await db.publicCacheInvalidation.updateMany({
    where: { scope: 'home', OR: [
      { verificationLeaseUntil: null }, { verificationLeaseUntil: { lte: new Date() } },
    ] }, data: { lastVerificationAt: new Date(0) },
  })).count, { timeout: 10_000 }).toBe(1);
  const assertions = { unsignedRejected: false, stableContentNoNewRevision: false,
    acknowledgedStalePageDetected: false, receiverBudgetPreserved: false, repairedPageVisible: false };
  const anonymous = await request.post(`${api}/internal/public-cache/verify`, {
    data: body, headers: { 'content-type': 'application/json' },
  });
  expect(anonymous.status()).toBe(401);
  assertions.unsignedRejected = true;
  const cycle = await db.matchCycle.findFirstOrThrow({ where: { status: 'OPEN' } });
  const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `publication-${account.email}`,
    passwordHash: user.passwordHash } });
  expect((await request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBe(true);
  const unchangedCycle = { cycleId: cycle.id, codename: cycle.codename, status: cycle.status,
    revealAt: cycle.revealAt.toISOString(), participationDeadline: cycle.participationDeadline.toISOString() };
  const wakeDispatcher = async () => expect((await request.put(`${api}/admin/cycles`, { data: unchangedCycle })).ok()).toBe(true);
  const original = cycle.revealAt;
  const changed = new Date(original.getTime() + 7_200_000);
  let firstHash = '';
  let repairedHash = '';
  try {
    // Finish pending fixture work using production dispatch, changing only the
    // disposable scheduling clock, before freezing the served baseline.
    await db.publicCacheInvalidation.update({ where: { scope: 'home' }, data: {
      dueAt: new Date(0), lastAttemptAt: null, lastClaimedAt: new Date(0),
    } });
    // Updating a synthetic deadline does not reschedule a production timer.
    await wakeDispatcher();
    await expect.poll(async () => {
      await request.get('/');
      const row = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
      return row.acknowledgedRevision >= row.revision;
    }, { timeout: 70_000, intervals: [250, 1000] }).toBe(true);
    await expect.poll(async () => {
      const response = await request.get('/');
      const html = await response.text();
      firstHash = fingerprint(html) ?? '';
      return response.headers()['x-nextjs-cache'] === 'HIT' && firstHash.length === 64;
    }).toBe(true);
    await due();
    expect((await verify()).ok()).toBe(true);
    const verified = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    expect(verified.verifiedHash).toBe(firstHash);
    const stableHtml = await (await request.get('/')).text();
    await due();
    const equal = await verify();
    expect(equal.ok()).toBe(true);
    expect((await equal.json()).outcome).toBe('verified');
    expect((await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } })).revision).toBe(verified.revision);
    expect(digest(await (await request.get('/')).text())).toBe(digest(stableHtml));
    assertions.stableContentNoNewRevision = true;

    // Model the durable boundary of a receiver crash: business commit exists,
    // claim and sender acknowledgment persist, while no tag side effect runs.
    await db.matchCycle.update({ where: { id: cycle.id }, data: { revealAt: changed } });
    // Source fields are read directly from the disposable committed state; the
    // original cached API landing can legitimately still have its previous TTL.
    const upstream = await (await request.get(`${api}/public/home`)).json();
    upstream.landing.currentCycle.revealAt = changed.toISOString();
    const intendedHash = digest(JSON.stringify(normalizePublicHomeSnapshot(upstream)));
    await db.$executeRaw`UPDATE "PublicCacheInvalidation" SET "acknowledgedRevision" = "revision",
      "claimedRevision" = "revision", "lastClaimedAt" = NOW(), "deliveredHash" = ${intendedHash},
      "dueAt" = NOW() + INTERVAL '30 minutes'
      WHERE "scope" = 'home'`;
    const lost = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    await due();
    const gated = await verify();
    expect(gated.ok()).toBe(true);
    expect((await gated.json()).outcome).toBe('mismatch');
    const retained = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    expect(retained.revision).toBe(lost.revision);
    expect(fingerprint(await (await request.get('/')).text())).toBe(firstHash);
    assertions.acknowledgedStalePageDetected = true;
    assertions.receiverBudgetPreserved = true;
    await db.publicCacheInvalidation.update({ where: { scope: 'home' }, data: {
      lastClaimedAt: new Date(0), lastAttemptAt: null,
    } });
    await due();
    expect((await verify()).ok()).toBe(true);
    const queued = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    expect(queued.revision).toBe(lost.revision + 1n);
    await expect.poll(async () => {
      const response = await request.get('/');
      const html = await response.text();
      repairedHash = fingerprint(html) ?? '';
      return response.headers()['x-nextjs-cache'] === 'HIT' && repairedHash !== firstHash
        && html.includes(changed.toISOString());
    }, { timeout: 30_000, intervals: [250, 500, 1000] }).toBe(true);
    await visit(page, '/');
    await expect(page.getByRole('main').locator('time[datetime]').filter({ visible: true }).first())
      .toHaveAttribute('datetime', changed.toISOString());

    assertions.repairedPageVisible = true;
    await due();
    expect((await verify()).ok()).toBe(true);
    expect((await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } })).verifiedHash).toBe(repairedHash);
  } finally {
    await db.matchCycle.update({ where: { id: cycle.id }, data: { revealAt: original } });
    await db.publicCacheInvalidation.update({ where: { scope: 'home' }, data: {
      dueAt: new Date(0), lastAttemptAt: null, lastClaimedAt: new Date(0), lastVerificationAt: new Date(0),
    } });
    await wakeDispatcher();
    await verify();
    await info.attach('publication-contract', { contentType: 'application/json', body: JSON.stringify({
      project: info.project.name, fingerprintsDiffer: firstHash !== repairedHash,
      assertions,
      crashBoundary: 'Disposable durable state reproduces claim-before-invalidate loss; no production process killed.',
    }, null, 2) });
  }
});

// Failure boundaries: Web-origin outages consume durable bounded attempts;
// a restart/expired lease cannot bypass exhaustion for identical intended content.
// A new intended content version can recover, without changing any browser path.
test('publication verification bounds outages and recovers expired ownership @smoke', async ({ page, db }, info) => {
  test.setTimeout(90_000);
  const request = page.request;
  const webPid = Number(process.env.E2E_WEB_PID);
  expect(Number.isInteger(webPid) && webPid > 1).toBe(true);
  const body = JSON.stringify({ scope: 'home' });
  const verify = async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const response = await request.post(`${api}/internal/public-cache/verify`, { data: body, headers: {
      'content-type': 'application/json', 'x-lilink-timestamp': timestamp,
      'x-lilink-signature': createHmac('sha256', process.env.PUBLIC_CACHE_REVALIDATION_SECRET!)
        .update(`${timestamp}.${body}`).digest('hex'),
    } });
    expect(response.ok()).toBe(true);
    return (await response.json()).outcome;
  };
  const before = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
  const attempts: string[] = [];
  try {
    await db.publicCacheInvalidation.update({ where: { scope: 'home' }, data: {
      verificationFailures: 5, verificationTargetHash: before.deliveredHash,
      lastVerificationAt: new Date(0), verificationLeaseToken: null, verificationLeaseUntil: null,
    } });
    process.kill(-webPid, 'SIGSTOP');
    for (let attempt = 5; attempt < 6; attempt++) {
      await db.publicCacheInvalidation.update({ where: { scope: 'home' }, data: { lastVerificationAt: new Date(0) } });
      attempts.push(await verify());
      expect(attempts.at(-1)).toBe('failed');
      expect((await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } })).verificationFailures).toBe(attempt + 1);
    }
    await db.publicCacheInvalidation.update({ where: { scope: 'home' }, data: {
      lastVerificationAt: new Date(0), verificationLeaseToken: 'synthetic-expired-owner', verificationLeaseUntil: new Date(0),
    } });
    expect(await verify()).toBe('skipped');
    expect((await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } })).verificationFailures).toBe(6);
  } finally { process.kill(-webPid, 'SIGCONT'); }
  let recoveryTransportErrors = 0;
  await expect.poll(async () => {
    try {
      const response = await request.get('/');
      return response.ok() && (await response.text()).includes('data-lilink-home-fingerprint="v1:');
    } catch {
      // SIGSTOP can leave an existing keep-alive socket reset after SIGCONT.
      recoveryTransportErrors++;
      return false;
    }
  }, { timeout: 10_000 }).toBe(true);
  await visit(page, '/');
  await expect(page.getByRole('heading', { name: /让相遇这件事.*值得被认真对待/ })).toBeVisible();
  // Change only the synthetic verifier's previous target. The actual intended
  // publication remains the durable sender's hash, as after a new delivery.
  await db.publicCacheInvalidation.update({ where: { scope: 'home' }, data: {
    verificationTargetHash: '0'.repeat(64), lastVerificationAt: new Date(0),
  } });
  expect(['verified', 'mismatch']).toContain(await verify());
  const recovered = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
  expect(recovered.verificationLeaseToken).toBeNull();
  expect(recovered.verificationFailures).toBeLessThan(6);
  await info.attach('bounded-publication-outage', { contentType: 'application/json', body: JSON.stringify({
    project: info.project.name, attempts, assertions: { finalAttemptPersistedAsSix: true,
      expiredOwnershipCannotResetExhaustion: true, cachedHomepageRemainsAvailable: true,
      nextIntendedContentCanAcquire: true }, recoveryTransportErrors, disposableClockAdvanced: true,
    fixture: 'Five prior failures are durable fixture data; only the final real Web-origin outage runs here.',
  }, null, 2) });
});

// Real HTTP receivers share a durable PostgreSQL claim, including a fresh process.
test('duplicate callbacks and real dispatch preserve the receiver budget', async ({ request, db, account }, info) => {
  test.setTimeout(120_000);
  const signedCallback = async (revision: string, origin = process.env.E2E_WEB_URL!, status = 200) => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({ scope: 'home', revision });
    const response = await request.post(`${origin}/api/internal/public-cache/revalidate`, { data: body, headers: {
      'content-type': 'application/json', 'x-lilink-timestamp': timestamp,
      'x-lilink-signature': createHmac('sha256', process.env.PUBLIC_CACHE_REVALIDATION_SECRET!).update(`${timestamp}.${body}`).digest('hex'),
    } });
    expect(response.status()).toBe(status);
    if (status === 429) {
      expect(Number(response.headers()['retry-after'])).toBeGreaterThan(0);
      expect(Number(response.headers()['retry-after'])).toBeLessThanOrEqual(1800);
    }
    return (await response.json()).invalidated;
  };
  const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `receiver-${account.email}`, passwordHash: user.passwordHash } });
  expect((await request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBe(true);
  const cycle = await db.matchCycle.findFirstOrThrow({ where: { status: 'OPEN' } });
  const original = { cycleId: cycle.id, codename: cycle.codename, status: cycle.status,
    participationDeadline: cycle.participationDeadline.toISOString(), revealAt: cycle.revealAt.toISOString() };
  const saveCycle = async (data = original) => expect((await request.put(`${api}/admin/cycles`, { data })).ok()).toBe(true);
  const makeDue = async (allowClaim: boolean) => {
    await expect.poll(async () => (await db.publicCacheInvalidation.updateMany({ where: {
      scope: 'home', OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }],
    }, data: { dueAt: new Date(0), lastAttemptAt: null, ...(allowClaim ? { lastClaimedAt: new Date(0) } : {}) } })).count).toBe(1);
  };
  const settled = async () => {
    await expect.poll(async () => {
      const row = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
      return row.acknowledgedRevision >= row.revision;
    }, { timeout: 25_000 }).toBe(true);
    const live = normalizePublicHomeSnapshot(await (await request.get(`${api}/public/home`)).json());
    await expect.poll(async () => {
      const response = await request.get('/');
      return response.headers()['x-nextjs-cache'] === 'HIT'
        && (await response.text()).includes(`data-lilink-home-fingerprint="v1:${hash(JSON.stringify(live))}"`);
    }, { timeout: 20_000 }).toBe(true);
  };
  await makeDue(true);
  await saveCycle();
  await settled();
  const unchangedHtml = hash(await (await request.get('/')).text());
  const beforeRegeneration = await homeCacheFiles();
  const pageBytes = (files: Awaited<ReturnType<typeof homeCacheFiles>>) => files
    .filter(file => /index\.(html|rsc)$/.test(file.file)).map(({ file, sha256 }) => ({ file, sha256 }));
  expect(pageBytes(beforeRegeneration)).toHaveLength(2);
  const pending = await db.publicCacheInvalidation.update({ where: { scope: 'home' }, data: {
    revision: { increment: 1 }, lastClaimedAt: new Date(0), dueAt: new Date(Date.now() + 3_600_000),
  } });
  const grants = await Promise.all(Array.from({ length: 20 }, () => signedCallback(pending.revision.toString())));
  expect(grants.filter(Boolean)).toHaveLength(1);
  const claimed = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
  expect(claimed.claimedRevision).toBe(pending.revision);
  await expect.poll(async () => (await request.get('/')).headers()['x-nextjs-cache']).toBe('HIT');
  expect(hash(await (await request.get('/')).text())).toBe(unchangedHtml);
  const files = await homeCacheFiles();
  expect(pageBytes(files)).toEqual(pageBytes(beforeRegeneration));
  expect(await signedCallback(pending.revision.toString())).toBe(false);
  expect(await signedCallback('1')).toBe(false);
  const receiver = await startReceiver(info.outputPath('fresh-receiver.log'));
  try { expect(await signedCallback(pending.revision.toString(), receiver.url)).toBe(false); }
  finally { await receiver.stop(); }
  const deferred = await db.publicCacheInvalidation.update({ where: { scope: 'home' }, data: { revision: { increment: 1 } } });
  await signedCallback(deferred.revision.toString(), process.env.E2E_WEB_URL!, 429);
  const after = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
  expect(after.claimedRevision).toBe(claimed.claimedRevision);
  expect(after.lastClaimedAt).toEqual(claimed.lastClaimedAt);
  expect(after.attempts).toBe(claimed.attempts);
  expect(after.revision).toBeGreaterThan(after.acknowledgedRevision);
  expect((await request.get('/')).headers()['x-nextjs-cache']).toBe('HIT');
  expect(await homeCacheFiles()).toEqual(files);

  const changed = { ...original, revealAt: new Date(cycle.revealAt.getTime() + 3_600_000).toISOString() };
  try {
    await saveCycle(changed);
    expect((await db.matchCycle.findUniqueOrThrow({ where: { id: cycle.id } })).revealAt.toISOString()).toBe(changed.revealAt);
    const beforeDispatch = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    const attemptStartedAt = Date.now();
    // Expire only the task-owned due time. The actual receiver's claim window
    // stays closed so production dispatch must interpret its HTTP Retry-After.
    await makeDue(false);
    await saveCycle(changed);
    await expect.poll(async () => {
      const row = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
      return (row.lastAttemptAt?.getTime() ?? 0) >= attemptStartedAt && row.leaseToken === null
        && row.leaseUntil === null && row.dueAt.getTime() > Date.now() + 60_000;
    }, { timeout: 25_000 }).toBe(true);
    const dispatchDeferred = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    expect(dispatchDeferred.acknowledgedRevision).toBe(beforeDispatch.acknowledgedRevision);
    expect(dispatchDeferred.claimedRevision).toBe(beforeDispatch.claimedRevision);
    expect(dispatchDeferred.lastClaimedAt).toEqual(beforeDispatch.lastClaimedAt);
    expect(dispatchDeferred.attempts).toBe(beforeDispatch.attempts);
    expect(dispatchDeferred.exhaustedAt).toBeNull();
    expect(dispatchDeferred.revision).toBeGreaterThan(dispatchDeferred.acknowledgedRevision);
    const cached = await request.get('/');
    expect(cached.headers()['x-nextjs-cache']).toBe('HIT');
    expect(hash(await cached.text())).toBe(unchangedHtml);
    expect(await homeCacheFiles()).toEqual(files);

    await makeDue(true);
    await saveCycle(changed);
    await settled();
    const published = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    expect(published.claimedRevision).toBeGreaterThanOrEqual(beforeDispatch.revision);
    expect(await (await request.get('/')).text()).toContain(changed.revealAt);
    await info.attach('receiver-and-dispatch-budget', { contentType: 'application/json', body: JSON.stringify({
      concurrentGrants: grants.filter(Boolean).length, unchangedHtmlAndRscAfterRegeneration: true,
      realDispatcherDeferredWithoutAttempt: true, deferredBusinessChangePublished: true,
      schedulingFixture: 'Only isolated PostgreSQL due/last-claim timestamps made historical; no JS or SQL clock mocked.',
    }) });
  } finally {
    await saveCycle(original);
    await makeDue(true);
    await saveCycle();
    await settled();
  }
});

async function startReceiver(logPath: string) {
  const directory = await receiverDirectory();
  const portServer = net.createServer();
  await new Promise<void>((resolve, reject) => {
    portServer.once('error', reject); portServer.listen(0, '127.0.0.1', resolve);
  });
  const address = portServer.address();
  if (!address || typeof address === 'string') throw new Error('Missing receiver port.');
  const port = address.port;
  await new Promise<void>(resolve => portServer.close(() => resolve()));
  const child = spawn(process.execPath, [path.join(directory, 'server.js')], {
    cwd: directory, env: { ...process.env, PORT: String(port), HOSTNAME: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = createWriteStream(logPath);
  child.stdout.pipe(log); child.stderr.pipe(log);
  let closed = false;
  const done = new Promise<void>((resolve, reject) => {
    child.once('error', reject); child.once('exit', () => { closed = true; resolve(); });
  });
  done.catch(() => {});
  const stop = async () => {
    if (!closed) child.kill('SIGTERM');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([done, new Promise<void>(resolve => { timeout = setTimeout(resolve, 3000); })]);
    } finally { clearTimeout(timeout); }
    if (!closed) { child.kill('SIGKILL'); await done; }
    log.end();
  };
  const url = `http://127.0.0.1:${port}`;
  try {
    await expect.poll(async () => {
      if (closed) throw new Error('Receiver exited before readiness.');
      try { return (await fetch(`${url}/api/internal/public-cache/revalidate`, { signal: AbortSignal.timeout(1000) })).status; }
      catch { return 0; }
    }, { timeout: 15_000, intervals: [100, 250, 500] }).toBe(405);
    return { url, stop };
  } catch (error) { await stop(); throw error; }
}

async function receiverDirectory() {
  const root = path.join(process.env.E2E_WORKSPACE!, 'apps/web/.next/standalone');
  const matches: string[] = [];
  const scan = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && !['node_modules', '.next', 'public'].includes(entry.name)) {
        await scan(path.join(directory, entry.name));
      } else if (entry.isFile() && entry.name === 'server.js') {
        const manifest = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
        if (manifest.name === 'web') matches.push(directory);
      }
    }
  };
  await scan(root);
  if (matches.length !== 1) throw new Error(`Expected one built standalone Web server; found ${matches.length}.`);
  return matches[0];
}

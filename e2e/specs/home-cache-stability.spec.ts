import { createHash, createHmac, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect, api, password, visit } from '../support/fixtures';
import { IsrWriteEvidence } from '../support/isr-write-evidence';

const webhook = '/api/internal/public-cache/revalidate';
const hash = (body: string) => createHash('sha256').update(body).digest('hex');
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
test('live API reads leave the long cached homepage unchanged @smoke', async ({ page, db }, info) => {
  test.setTimeout(180_000);
  const baseline = new IsrWriteEvidence(info.outputPath('live-read-baseline-cache'));
  const baselineReads: Array<{ cache: string | undefined; htmlSha256: string }> = [];
  await baseline.start();
  let first = '';
  let pendingRevision: string | null = null;
  let beforeGeneratedAt: string | null = null;
  let settledGeneratedAt: string | null = null;
  let revisionToDrain: bigint | null = null;
  let earlierNotificationsDrained = false;
  let upstreamAndSameOriginCacheConverged = false;
  try {
    // A startup retry can arrive after an initial HIT. Advance only pending
    // clocks with a compare-and-set; the dispatcher retains lease ownership.
    await expect.poll(async () => {
      const row = await db.publicCacheInvalidation.findUnique({ where: { scope: 'home' } });
      if (row?.leaseUntil && row.leaseUntil.getTime() > Date.now()) return false;
      const upstream = await page.request.get(`${api}/public/home`);
      expect(upstream.ok()).toBe(true);
      beforeGeneratedAt = (await upstream.json()).community.generatedAt;
      if (!row || row.revision <= row.acknowledgedRevision) return true;
      const advanced = await db.publicCacheInvalidation.updateMany({ where: {
        scope: 'home', revision: row.revision, acknowledgedRevision: { lt: row.revision },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: new Date() } }],
      }, data: { dueAt: new Date(0), lastAttemptAt: null, lastClaimedAt: new Date(0) } });
      if (advanced.count !== 1) return false;
      revisionToDrain = row.revision;
      pendingRevision = row.revision.toString();
      return true;
    }, { timeout: 35_000, intervals: [250, 500] }).toBe(true);
    if (revisionToDrain !== null) {
      const targetRevision = revisionToDrain;
      await expect.poll(async () => {
        const row = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
        return row.acknowledgedRevision >= targetRevision && row.leaseUntil === null;
      }, { timeout: 65_000, intervals: [250, 500, 1000] }).toBe(true);
      await expect.poll(async () => {
        const response = await page.request.get(`${api}/public/home`);
        expect(response.ok()).toBe(true);
        settledGeneratedAt = (await response.json()).community.generatedAt;
        return settledGeneratedAt !== beforeGeneratedAt;
      }, { timeout: 10_000, intervals: [250, 500] }).toBe(true);
    }
    earlierNotificationsDrained = true;
    // Compare the anonymous upstream payload with the actual same-origin Data
    // Cache, not two stale HTTP snapshots that happen to agree.
    await expect.poll(async () => {
      const live = await page.request.get(`${api}/public/home`);
      expect(live.ok()).toBe(true);
      const payload = await live.json();
      settledGeneratedAt = payload.community.generatedAt;
      const expected = JSON.parse(JSON.stringify(payload, (key, value) => key === 'generatedAt' ? undefined : value));
      const response = await page.request.get('/');
      expect(response.ok()).toBe(true);
      first = await response.text();
      baselineReads.push({ cache: response.headers()['x-nextjs-cache'], htmlSha256: hash(first) });
      const files = await baseline.mark('converging');
      const cached = await Promise.all(files.filter(file => file.kind === 'data').map(async file => {
        const value = JSON.parse(await readFile(path.join(baseline.output, file.artifact), 'utf8'));
        return JSON.parse(value.data.body);
      }));
      return response.headers()['x-nextjs-cache'] === 'HIT' && cached.some(value => isDeepStrictEqual(value, expected));
    }, { timeout: 20_000, intervals: [250, 500, 1000] }).toBe(true);
    await baseline.quiet(1000);
    const confirmed = await page.request.get('/');
    expect(confirmed.headers()['x-nextjs-cache']).toBe('HIT');
    expect(hash(await confirmed.text())).toBe(hash(first));
    upstreamAndSameOriginCacheConverged = true;
  } finally {
    await baseline.stop();
    await info.attach('live-read-converged-baseline', { contentType: 'application/json', body: JSON.stringify({
      pendingRevision, beforeGeneratedAt, settledGeneratedAt, reads: baselineReads,
      quietMilliseconds: 1000, evidence: await baseline.summarize(),
      assertions: { earlierNotificationsDrained, upstreamAndSameOriginCacheConverged },
    }, null, 2) });
  }
  expect(baseline.errors).toEqual([]);
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
  try {
    await visit(page, '/admin');
    await page.getByLabel('管理员邮箱', { exact: true }).fill(admin.email);
    await page.getByLabel('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: '进入后台', exact: true }).click();
    await expect.poll(async () => (await context.request.get(`${api}/admin-session/me`)).status()).toBe(200);
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
    await page.screenshot({ path: info.outputPath('committed-cycle-invalidation.png'), fullPage: true });
    const delivered = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    await info.attach('business-invalidation', { contentType: 'application/json', body: JSON.stringify({
      project: info.project.name, pendingRevision: pending.revision.toString(),
      acknowledgedRevision: delivered.acknowledgedRevision.toString(), attempts: delivered.attempts,
      assertions: { adminUiSaved: true, queueCommitted: true, actualDispatcherDelivered: true,
        serverHtmlUpdated: true, browserUpdated: true, visibleJoinCtaUpdated: true },
    }, null, 2) });
  } finally {
    const response = await context.request.put(`${api}/admin/cycles`, { data: {
      cycleId: cycle.id, codename: cycle.codename, status: cycle.status,
      participationDeadline: cycle.participationDeadline.toISOString(), revealAt: cycle.revealAt.toISOString(),
    } });
    expect(response.ok()).toBe(true);
    const cleanup = await db.publicCacheInvalidation.update({ where: { scope: 'home' }, data: {
      dueAt: new Date(0), lastAttemptAt: null, leaseUntil: null, lastClaimedAt: new Date(0),
    } });
    const body = JSON.stringify({ scope: 'home', revision: cleanup.revision.toString() });
    expect((await context.request.post(webhook, { data: body, headers: signed(body) })).ok()).toBe(true);
  }
});

// Failure boundaries: rollback must also roll back the pending event; bursts of
// ordinary writes increase the revision while retaining their original due time.
test('transactional cache notifications roll back and coalesce membership bursts @smoke', async ({ db }, info) => {
  const school = await db.school.findUniqueOrThrow({ where: { slug: 'e2e-school' } });
  const data = () => ({ email: `${randomUUID()}@school.example.test`, passwordHash: 'synthetic-unused',
    displayName: '事务验收同学', status: 'ACTIVE', schoolId: school.id, isTest: false, acceptedTermsAt: new Date() });
  const before = await db.publicCacheInvalidation.findUnique({ where: { scope: 'home' } });
  await expect(db.$transaction(async (tx: any) => {
    await tx.user.create({ data: data() });
    throw new Error('synthetic-rollback');
  })).rejects.toThrow('synthetic-rollback');
  const rolledBack = await db.publicCacheInvalidation.findUnique({ where: { scope: 'home' } });
  expect(rolledBack?.revision).toBe(before?.revision);
  const first = await db.user.create({ data: data() });
  const pending = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
  const second = await db.user.create({ data: data() });
  const coalesced = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
  expect(coalesced.revision).toBe(pending.revision + 1n);
  expect(coalesced.dueAt.toISOString()).toBe(pending.dueAt.toISOString());
  await db.user.deleteMany({ where: { id: { in: [first.id, second.id] } } });
  await info.attach('transactional-coalescing', { contentType: 'application/json', body: JSON.stringify({
    project: info.project.name, assertions: { rollbackPreservesRevision: true, membershipBurstCoalesced: true },
  }, null, 2) });
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
  const baseline = new IsrWriteEvidence(info.outputPath('outage-baseline-cache'));
  const baselineReads: Array<{ cache: string | undefined; htmlSha256: string }> = [];
  await baseline.start();
  try {
    await expect.poll(async () => {
      const response = await page.request.get('/');
      expect(response.ok()).toBe(true);
      const html = await response.text();
      expect(html).toContain('各学校已加入人数');
      baselineReads.push({ cache: response.headers()['x-nextjs-cache'], htmlSha256: hash(html) });
      return response.headers()['x-nextjs-cache'];
    }, { timeout: 15_000, intervals: [100, 250, 500] }).toBe('HIT');
    await baseline.quiet(1000);
    const confirmed = await page.request.get('/');
    const html = await confirmed.text();
    expect(confirmed.headers()['x-nextjs-cache']).toBe('HIT');
    expect(hash(html)).toBe(baselineReads.at(-1)!.htmlSha256);
    baselineReads.push({ cache: confirmed.headers()['x-nextjs-cache'], htmlSha256: hash(html) });
  } finally {
    await baseline.stop();
    await info.attach('outage-converged-baseline', { contentType: 'application/json', body: JSON.stringify({
      reads: baselineReads, quietMilliseconds: 1000, evidence: await baseline.summarize(),
    }, null, 2) });
  }
  expect(baseline.errors).toEqual([]);
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

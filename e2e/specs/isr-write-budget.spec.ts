import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { test, expect, api, password, visit } from '../support/fixtures';
import { IsrWriteEvidence, sha256 } from '../support/isr-write-evidence';

// Failure boundaries: stable reads must not rewrite cache files; committed
// changes must wait for a real read, then converge under concurrent requests.
// Duplicate, old and concurrent signed callbacks must consume one persistent
// claim at most, including a new receiver process with independent cache files.
// Double SWR may write old and fresh HTML separately; retain every seen version.
// Disk mtimes and byte estimates are never equated with provider billable writes.
// Visible state excludes hidden streamed copies and requires one countdown and
// one bottom CTA; a unique but hidden snapshot does not satisfy the contract.
test('measure homepage cache writes around real and duplicate invalidations @smoke', async ({ page, context, request, db, account, browser }, info) => {
  test.setTimeout(260_000);
  const output = path.join(process.env.E2E_OUTPUT!, 'isr-write-evidence');
  await mkdir(output, { recursive: true });
  const evidence = new IsrWriteEvidence(output);
  const requests: Array<Record<string, unknown>> = [];
  const callbacks: Array<Record<string, unknown>> = [];
  const assertions: Record<string, boolean> = {};
  const queue: Array<Record<string, unknown>> = [];
  const cycle = await db.matchCycle.findFirstOrThrow({ where: { status: 'OPEN' } });
  const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `write-budget-${account.email}`,
    passwordHash: user.passwordHash, displayName: '缓存计量管理员' } });
  let phase = 'setup';
  let mutationSaved = false;
  let observerStarted = false;
  let primaryFailure = false;
  const signedCallback = async (revision: string, baseUrl = process.env.E2E_WEB_URL!, expectedStatus = 200) => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify({ scope: 'home', revision });
    const response = await request.post(`${baseUrl}/api/internal/public-cache/revalidate`, { data: body, headers: {
      'content-type': 'application/json', 'x-lilink-timestamp': timestamp,
      'x-lilink-signature': createHmac('sha256', process.env.PUBLIC_CACHE_REVALIDATION_SECRET!).update(`${timestamp}.${body}`).digest('hex'),
    } });
    const result = await response.json();
    const retryAfterSeconds = Number(response.headers()['retry-after']);
    callbacks.push({ phase, revision, at: new Date().toISOString(), status: response.status(),
      invalidated: result.invalidated, retryAfterSeconds: expectedStatus === 429 ? retryAfterSeconds : null });
    expect(response.status()).toBe(expectedStatus);
    if (expectedStatus === 200) expect(typeof result.invalidated).toBe('boolean');
    if (expectedStatus === 429) {
      expect(retryAfterSeconds).toBeGreaterThan(0);
      expect(retryAfterSeconds).toBeLessThanOrEqual(1800);
    }
    return result.invalidated as boolean;
  };
  const getHome = async () => {
    const started = Date.now();
    const response = await request.get('/');
    const bytes = await response.body();
    const html = bytes.toString();
    requests.push({ phase, startedAt: new Date(started).toISOString(), elapsedMs: Date.now() - started,
      status: response.status(), cache: response.headers()['x-nextjs-cache'], sha256: sha256(bytes),
      bytes: bytes.length, gzipBytes: gzipSync(bytes).length,
      pendingCycleVisible: html.includes('轮次时间待配置'),
      containsTraceMeta: /name="(?:sentry-trace|baggage)"/.test(html) });
    expect(response.ok()).toBe(true);
    return { html, cache: response.headers()['x-nextjs-cache'], sha256: sha256(bytes) };
  };
  const setPhase = async (name: string) => { phase = name; return evidence.mark(name); };
  const queueSnapshot = async (label: string) => {
    const row = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    const value = { label, revision: row.revision.toString(), acknowledgedRevision: row.acknowledgedRevision.toString(),
      claimedRevision: row.claimedRevision.toString(), lastClaimedAt: row.lastClaimedAt?.toISOString() ?? null,
      attempts: row.attempts, urgent: row.urgent, dueAt: row.dueAt.toISOString(),
      lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null, exhaustedAt: row.exhaustedAt?.toISOString() ?? null,
      leaseHeld: row.leaseToken !== null,
      lastDeliveredAt: row.lastDeliveredAt?.toISOString() ?? null, deliveredHash: row.deliveredHash };
    queue.push(value); return row;
  };
  const cycleData = { cycleId: cycle.id, codename: cycle.codename, status: cycle.status,
    participationDeadline: cycle.participationDeadline.toISOString(), revealAt: cycle.revealAt.toISOString() };
  const wakeDispatcher = async (currentCycle: typeof cycleData) => {
    const before = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    // Advancing the disposable DB clock cannot reschedule the worker's timer.
    // A no-op business save invokes its real post-commit wake without a new event.
    expect((await context.request.put(`${api}/admin/cycles`, { data: currentCycle })).ok()).toBe(true);
    const after = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
    expect(after.revision).toBe(before.revision);
  };
  try {
    await visit(page, '/admin');
    await page.getByLabel('管理员邮箱', { exact: true }).fill(admin.email);
    await page.getByLabel('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: '进入后台', exact: true }).click();
    await expect.poll(async () => (await context.request.get(`${api}/admin-session/me`)).status()).toBe(200);
    await page.close();
    // Settle prior synthetic setup and suite mutations before measuring.
    await db.publicCacheInvalidation.update({ where: { scope: 'home' }, data: {
      dueAt: new Date(0), lastAttemptAt: null, leaseUntil: null, lastClaimedAt: new Date(0),
    } });
    await wakeDispatcher(cycleData);
    await expect.poll(async () => {
      const row = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
      return row.revision <= row.acknowledgedRevision;
    }, { timeout: 25_000, intervals: [100, 250, 500] }).toBe(true);
    await evidence.start(); observerStarted = true;
    const setupQueue = await queueSnapshot('setup-delivered');
    await signedCallback(setupQueue.revision.toString());
    const upstream = await (await request.get(`${api}/public/home`)).json();
    await expect.poll(async () => {
      await getHome(); await evidence.flush();
      const latest = [...evidence.versions].reverse().find(row => row.kind === 'data');
      if (!latest) return false;
      const cached = JSON.parse(await readFile(path.join(output, latest.artifact), 'utf8'));
      const payload = JSON.parse(cached.data.body);
      return payload.landing.stats.registeredUsers === upstream.landing.stats.registeredUsers
        && payload.landing.currentCycle?.revealAt === upstream.landing.currentCycle?.revealAt;
    }, { timeout: 15_000, intervals: [100, 250, 500] }).toBe(true);
    await expect.poll(async () => (await getHome()).cache).toBe('HIT');
    await evidence.quiet();
    const initial = await getHome();
    const initialFiles = await setPhase('stable-100-reads');
    expect(initialFiles.some(row => row.path === 'server/app/index.html')).toBe(true);
    expect(initialFiles.some(row => row.kind === 'data')).toBe(true);
    for (let i = 0; i < 20; i++) {
      const value = await getHome(); expect(value.cache).toBe('HIT'); expect(value.sha256).toBe(initial.sha256);
    }
    for (let batch = 0; batch < 4; batch++) {
      const values = await Promise.all(Array.from({ length: 20 }, () => getHome()));
      for (const value of values) { expect(value.cache).toBe('HIT'); expect(value.sha256).toBe(initial.sha256); }
    }
    await evidence.quiet();
    expect(evidence.versions.filter(row => row.phase === phase)).toHaveLength(0);
    assertions.stable100ReadsIncluding20ConcurrentNoDiskRewrite = true;

    await setPhase('real-dispatch-budget-deferral');
    const renamedCodename = `${cycle.codename}-延期验收`;
    const changedRevealAt = new Date(cycle.revealAt.getTime() + 3_600_000);
    changedRevealAt.setUTCSeconds(0, 0);
    const revealInput = new Date(changedRevealAt.getTime() + 8 * 3_600_000).toISOString().slice(0, 16);
    const renamePage = await context.newPage();
    try {
      await visit(renamePage, '/admin/cycles');
      await renamePage.getByRole('button', { name: '编辑轮次', exact: true }).click();
      await renamePage.getByRole('textbox', { name: '轮次代号', exact: true }).fill(renamedCodename);
      await renamePage.getByLabel('揭晓时间（北京时间）', { exact: true }).fill(revealInput);
      await renamePage.getByRole('button', { name: '保存轮次', exact: true }).click();
      await expect.poll(async () => (await db.matchCycle.findUniqueOrThrow({ where: { id: cycle.id } })).codename).toBe(renamedCodename);
      expect((await db.matchCycle.findUniqueOrThrow({ where: { id: cycle.id } })).revealAt.toISOString()).toBe(changedRevealAt.toISOString());
      mutationSaved = true;
      await renamePage.screenshot({ path: info.outputPath('admin-cycle-renamed.png'), fullPage: true });
    } finally { await renamePage.close(); }
    const beforeDeferral = await queueSnapshot('real-change-before-budget-deferral');
    const attemptStartedAt = Date.now();
    // Override only the disposable due time to exercise a real 429 round trip;
    // leave lastClaimedAt untouched so the production receiver budget applies.
    await db.publicCacheInvalidation.update({ where: { scope: 'home' }, data: {
      dueAt: new Date(0), lastAttemptAt: null, leaseUntil: null,
    } });
    const renamedCycleData = { ...cycleData, codename: renamedCodename, revealAt: changedRevealAt.toISOString() };
    await wakeDispatcher(renamedCycleData);
    await expect.poll(async () => {
      const row = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
      return (row.lastAttemptAt?.getTime() ?? 0) >= attemptStartedAt
        && row.leaseToken === null && row.dueAt.getTime() > Date.now() + 60_000;
    }, { timeout: 70_000, intervals: [100, 250, 500, 1000] }).toBe(true);
    const afterDispatchDeferral = await queueSnapshot('real-dispatch-deferred-without-consuming-attempt');
    expect(afterDispatchDeferral.acknowledgedRevision).toBe(beforeDeferral.acknowledgedRevision);
    expect(afterDispatchDeferral.claimedRevision).toBe(beforeDeferral.claimedRevision);
    expect(afterDispatchDeferral.lastClaimedAt?.toISOString()).toBe(beforeDeferral.lastClaimedAt!.toISOString());
    expect(afterDispatchDeferral.attempts).toBe(beforeDeferral.attempts);
    expect(afterDispatchDeferral.exhaustedAt).toBeNull();
    const deferredHome = await getHome();
    expect(deferredHome.cache).toBe('HIT');
    expect(deferredHome.sha256).toBe(initial.sha256);
    expect(deferredHome.html).not.toContain(changedRevealAt.toISOString());
    await evidence.quiet();
    expect(evidence.versions.filter(row => row.phase === phase)).toHaveLength(0);
    assertions.realDispatcherBudgetDeferralPreservedAttemptsPendingAndCachedPage = true;

    await setPhase('real-dispatch-after-budget-window');
    await db.publicCacheInvalidation.update({ where: { scope: 'home' }, data: {
      dueAt: new Date(0), lastAttemptAt: null, leaseUntil: null, lastClaimedAt: new Date(0),
    } });
    await wakeDispatcher(renamedCycleData);
    await expect.poll(async () => {
      const row = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
      return row.acknowledgedRevision >= beforeDeferral.revision && row.claimedRevision >= beforeDeferral.revision;
    }, { timeout: 25_000, intervals: [100, 250, 500] }).toBe(true);
    await expect.poll(async () => {
      const home = await getHome();
      return home.cache === 'HIT' && home.html.includes(changedRevealAt.toISOString());
    }, { timeout: 20_000, intervals: [100, 250, 500] }).toBe(true);
    await evidence.quiet();
    assertions.deferredRealBusinessChangeEventuallyUpdatedTheServerPage = true;

    await setPhase('business-ui-mutation');
    const adminPage = await context.newPage();
    try {
      await visit(adminPage, '/admin/cycles');
      await adminPage.getByRole('button', { name: '编辑轮次', exact: true }).click();
      await adminPage.getByRole('combobox', { name: '状态', exact: true }).selectOption('DRAFT');
      await adminPage.getByRole('button', { name: '保存轮次', exact: true }).click();
      await expect.poll(async () => (await db.matchCycle.findUniqueOrThrow({ where: { id: cycle.id } })).status).toBe('DRAFT');
      mutationSaved = true;
      await adminPage.screenshot({ path: info.outputPath('admin-cycle-saved.png'), fullPage: true });
    } finally { await adminPage.close(); }
    const pending = await queueSnapshot('business-pending');
    expect(pending.revision > pending.acknowledgedRevision).toBe(true);
    await setPhase('business-invalidated-no-home-read');
    await db.publicCacheInvalidation.update({ where: { scope: 'home' }, data: {
      dueAt: new Date(0), lastAttemptAt: null, leaseUntil: null, lastClaimedAt: new Date(0),
    } });
    await wakeDispatcher({ ...renamedCycleData, status: 'DRAFT' });
    await expect.poll(async () => {
      const row = await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } });
      return row.acknowledgedRevision >= pending.revision && row.lastDeliveredAt !== null;
    }, { timeout: 25_000, intervals: [100, 250, 500] }).toBe(true);
    const delivered = await queueSnapshot('business-delivered');
    expect(delivered.claimedRevision >= pending.revision).toBe(true);
    expect(delivered.lastClaimedAt).not.toBeNull();
    await new Promise(resolve => setTimeout(resolve, 6000));
    await evidence.flush();
    expect(evidence.versions.filter(row => row.phase === phase)).toHaveLength(0);
    assertions.invalidatedWithoutHomeReadDidNotRewriteFor6Seconds = true;

    await setPhase('business-concurrent-convergence');
    await Promise.all(Array.from({ length: 20 }, () => getHome()));
    await expect.poll(async () => {
      const response = await getHome();
      return response.cache === 'HIT' && response.html.includes('轮次时间待配置') && !response.html.includes(cycle.revealAt.toISOString());
    }, { timeout: 20_000, intervals: [100, 200, 500] }).toBe(true);
    await evidence.quiet();
    expect(evidence.versions.some(row => row.phase === phase && row.path === 'server/app/index.html' && row.complete)).toBe(true);
    assertions.businessChangeConvergedAfterConcurrentReads = true;

    for (let i = 1; i <= 3; i++) {
      await setPhase(`duplicate-same-revision-${i}`);
      expect(await signedCallback(pending.revision.toString())).toBe(false);
      await Promise.all(Array.from({ length: 20 }, () => getHome()));
      await expect.poll(async () => {
        const response = await getHome();
        return response.cache === 'HIT' && response.html.includes('轮次时间待配置');
      }, { timeout: 20_000, intervals: [100, 200, 500] }).toBe(true);
      await evidence.quiet();
      expect(evidence.versions.filter(row => row.phase === phase)).toHaveLength(0);
    }
    await setPhase('older-revision');
    expect(await signedCallback('1')).toBe(false);
    expect((await getHome()).cache).toBe('HIT');
    await evidence.quiet();
    expect(evidence.versions.filter(row => row.phase === phase)).toHaveLength(0);
    const afterReplay = await queueSnapshot('after-replays');
    expect(afterReplay.claimedRevision).toBe(delivered.claimedRevision);
    expect(afterReplay.lastClaimedAt?.toISOString()).toBe(delivered.lastClaimedAt!.toISOString());
    assertions.sameAndOlderRevisionCallbacksDidNotRewriteCache = true;

    await setPhase('concurrent-twenty-callbacks');
    const unchangedBefore = await getHome();
    const rscBefore = await readFile(path.join(evidence.nextRoot, 'server/app/index.rsc'));
    // Advance only this disposable queue, reserving the production interval for
    // budget verification and excluding the real dispatcher from this claim race.
    const concurrent = await db.publicCacheInvalidation.update({ where: { scope: 'home' }, data: {
      revision: { increment: 1 }, lastClaimedAt: new Date(0), dueAt: new Date(Date.now() + 3_600_000),
    } });
    const grants = await Promise.all(Array.from({ length: 20 }, () => signedCallback(concurrent.revision.toString())));
    expect(grants.filter(Boolean)).toHaveLength(1);
    const claimed = await queueSnapshot('concurrent-claimed');
    expect(claimed.claimedRevision).toBe(concurrent.revision);
    await Promise.all(Array.from({ length: 20 }, () => getHome()));
    await expect.poll(async () => (await getHome()).cache, { timeout: 20_000, intervals: [100, 250, 500] }).toBe('HIT');
    await evidence.quiet();
    const unchangedAfter = await getHome();
    expect(unchangedAfter.sha256).toBe(unchangedBefore.sha256);
    expect(sha256(await readFile(path.join(evidence.nextRoot, 'server/app/index.rsc')))).toBe(sha256(rscBefore));
    expect(unchangedAfter.html).not.toMatch(/name="(?:sentry-trace|baggage)"/);
    assertions.unchangedRegenerationProducedIdenticalHtmlAndRsc = true;
    if (process.env.E2E_SENTRY_TRACING === '1') {
      await expect.poll(async () => {
        const response = await request.get(`${process.env.E2E_SENTRY_URL}/events`);
        const events = await response.json();
        return events.some((event: { type: string; op?: string; transaction?: string }) =>
          event.type === 'transaction' && event.op === 'http.server' && event.transaction === 'GET /');
      }, { timeout: 15_000, intervals: [250, 500] }).toBe(true);
      assertions.serverHomepageTracingRemainsEnabled = true;
    }
    assertions.twentyConcurrentCallbacksReceivedOneDurableClaim = true;

    await setPhase('budget-defers-new-revision');
    const deferred = await db.publicCacheInvalidation.update({ where: { scope: 'home' }, data: {
      revision: { increment: 1 }, dueAt: new Date(Date.now() + 3_600_000),
    } });
    await signedCallback(deferred.revision.toString(), process.env.E2E_WEB_URL!, 429);
    const afterDeferred = await queueSnapshot('deferred-revision-remains-pending');
    expect(afterDeferred.claimedRevision).toBe(claimed.claimedRevision);
    expect(afterDeferred.revision > afterDeferred.acknowledgedRevision).toBe(true);
    expect(afterDeferred.attempts).toBe(claimed.attempts);
    expect(afterDeferred.lastClaimedAt?.toISOString()).toBe(claimed.lastClaimedAt!.toISOString());
    expect((await getHome()).cache).toBe('HIT');
    await evidence.quiet();
    expect(evidence.versions.filter(row => row.phase === phase)).toHaveLength(0);
    assertions.frequencyGateKeptNewRevisionPendingWithoutCacheRewrite = true;

    await setPhase('receiver-new-instance-and-restart');
    const instanceReports = [];
    for (let instance = 1; instance <= 2; instance++) {
      const receiver = await startReceiver(info.outputPath(`receiver-${instance}.log`));
      try {
        expect(await signedCallback(concurrent.revision.toString(), receiver.url)).toBe(false);
        instanceReports.push({ instance, invalidated: false, isolatedCacheDirectory: true });
      } finally { await receiver.stop(); }
    }
    const afterRestart = await queueSnapshot('after-receiver-restart');
    expect(afterRestart.claimedRevision).toBe(claimed.claimedRevision);
    expect(afterRestart.lastClaimedAt?.toISOString()).toBe(claimed.lastClaimedAt!.toISOString());
    await info.attach('receiver-restart', { contentType: 'application/json', body: JSON.stringify(instanceReports, null, 2) });
    assertions.newReceiverProcessAndRestartKeptDurableDeduplication = true;
    assertions.duplicateCallbacksPreservedVisibleBusinessState = true;
    await setPhase('final-visible-page');
    const visible = await browser.newPage({ baseURL: process.env.E2E_WEB_URL, serviceWorkers: 'block', viewport: { width: 1280, height: 800 } });
    try {
      await visit(visible, '/');
      const main = visible.getByRole('main');
      const countdown = main.getByText('轮次时间待配置', { exact: true }).filter({ visible: true });
      const joinMessage = main.getByText('完成匹配资料，准备下一次校园里的认真相遇。', { exact: true }).filter({ visible: true });
      await expect(countdown).toHaveCount(1);
      await expect(countdown).toBeVisible();
      await expect(joinMessage).toHaveCount(1);
      await expect(joinMessage).toBeVisible();
      await visible.screenshot({ path: info.outputPath('homepage-after-business-change.png'), fullPage: true });
    } finally { await visible.close(); }
    assertions.browserCountdownAndJoinCtaAgreeWithCommittedChange = true;
  } catch (error) {
    primaryFailure = true;
    throw error;
  } finally {
    const finalizationErrors: unknown[] = [];
    try {
      if (observerStarted) await evidence.stop();
      const summary = observerStarted ? await evidence.summarize() : { observationErrors: ['Observer did not start.'] };
      const report = { runId: process.env.E2E_RUN_ID, project: info.project.name, browser: browser.version(),
        generatedAt: new Date().toISOString(), assertions, queue, callbacks, requests, ...summary,
        environment: { productionBuild: true, disposableSyntheticData: true, independentStaticCdn: Boolean(process.env.E2E_CDN_URL),
          sentryDsnEmptyInExistingRunner: !process.env.SENTRY_DSN && !process.env.NEXT_PUBLIC_SENTRY_DSN },
        manifest: await evidence.manifestSummary() };
      await writeFile(path.join(output, 'evidence.json'), JSON.stringify(report, null, 2));
      await info.attach('isr-write-measurement', { contentType: 'application/json', path: path.join(output, 'evidence.json') });
      expect(summary.observationErrors, 'Cache observation errors invalidate a zero-write result.').toEqual([]);
    } catch (error) { finalizationErrors.push(error); }
    // Restore synthetic business state even when collecting evidence failed.
    try {
      if (mutationSaved) {
        expect((await context.request.put(`${api}/admin/cycles`, { data: cycleData })).ok()).toBe(true);
        await db.publicCacheInvalidation.update({ where: { scope: 'home' }, data: {
          dueAt: new Date(0), lastAttemptAt: null, leaseUntil: null, lastClaimedAt: new Date(0),
        } });
        await wakeDispatcher(cycleData);
      }
    } catch (error) { finalizationErrors.push(error); }
    if (finalizationErrors.length) {
      if (!primaryFailure) throw finalizationErrors[0];
      info.annotations.push({ type: 'isr-finalization-failure',
        description: 'Finalization also failed; the original test failure is retained. See the measurement attachment and trace.' });
    }
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

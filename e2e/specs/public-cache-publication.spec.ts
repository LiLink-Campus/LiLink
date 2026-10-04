import { createHash, createHmac } from 'node:crypto';
import { normalizePublicHomeSnapshot } from '@lilink/shared';
import { test, expect, api, visit } from '../support/fixtures';

// Failure boundaries: a successful claim can precede a lost invalidation. A
// delivery acknowledgment is not proof of published content. Verification must
// read the real cached HTML, preserve the rate gate, and repair an acknowledged
// stale page. Equal published content must not enqueue work or change HTML.
// Unauthenticated control requests cannot read or mutate publication state.
test('publication verification repairs an acknowledged stale homepage @smoke', async ({ page, db }, info) => {
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
    await page.screenshot({ path: info.outputPath('publication-repaired.png'), fullPage: true });
    assertions.repairedPageVisible = true;
    await due();
    expect((await verify()).ok()).toBe(true);
    expect((await db.publicCacheInvalidation.findUniqueOrThrow({ where: { scope: 'home' } })).verifiedHash).toBe(repairedHash);
  } finally {
    await db.matchCycle.update({ where: { id: cycle.id }, data: { revealAt: original } });
    await db.publicCacheInvalidation.update({ where: { scope: 'home' }, data: {
      dueAt: new Date(0), lastAttemptAt: null, lastClaimedAt: new Date(0), lastVerificationAt: new Date(0),
    } });
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
      verificationFailures: 0, verificationTargetHash: before.deliveredHash,
      lastVerificationAt: new Date(0), verificationLeaseToken: null, verificationLeaseUntil: null,
    } });
    process.kill(-webPid, 'SIGSTOP');
    for (let attempt = 0; attempt < 6; attempt++) {
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
    project: info.project.name, attempts, assertions: { sixFailuresPersisted: true,
      expiredOwnershipCannotResetExhaustion: true, cachedHomepageRemainsAvailable: true,
      nextIntendedContentCanAcquire: true }, recoveryTransportErrors, disposableClockAdvanced: true,
  }, null, 2) });
});

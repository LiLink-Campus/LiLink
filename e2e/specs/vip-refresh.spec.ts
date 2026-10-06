import { test, expect, visit, completeProfile } from '../support/fixtures';
import { expectVip, focus, readyCenter, setVipBootstrap, vipActive, vipPages, vipScreenshot, visibility } from '../support/vip-refresh';

// Failure boundaries: unknown bootstrap is not non-membership; cancellation is
// not a read error; one visible lifecycle owns all timers and responses.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test.beforeEach(async ({ signedIn, context, db, account }) => {
  void signedIn;
  await completeProfile(context, db);
  await db.vipActivation.create({ data: { codeHash: `refresh-${account.id}`, batch: 'e2e-refresh',
    userId: account.id, activatedAt: new Date(), expiresAt: new Date('2030-01-01') } });
});

for (const entry of vipPages) {
  test(`${entry.endpoint} valid bootstrap avoids startup read, pauses and coalesces fast resume @smoke`, async ({ page }, info) => {
    await page.clock.install();
    let calls = 0;
    const ledger: { number: number; event: string }[] = [];
    page.on('requestfailed', request => { if (request.url().endsWith('/me/vip')) ledger.push({ number: calls, event: 'cancelled' }); });
    await page.route('**/v1/me/vip', async route => {
      const number = ++calls;
      ledger.push({ number, event: 'started' });
      await route.fulfill({ json: vipActive });
      ledger.push({ number, event: 'fulfilled' });
    });
    await visit(page, entry.path);
    await expectVip(page, entry.endpoint, true);
    if (entry.endpoint === 'center') await readyCenter(page);
    expect(calls).toBe(0);
    await page.clock.runFor(30_100);
    await expect.poll(() => calls).toBe(1);
    await visibility(page, true);
    await page.clock.runFor(90_100);
    expect(calls).toBe(1);
    await visibility(page, false);
    await expect.poll(() => calls).toBe(2);
    // Let the fast response settle before the companion event arrives.
    await expectVip(page, entry.endpoint, true);
    await focus(page, 10);
    await page.clock.runFor(100);
    expect(calls).toBe(2);
    await page.clock.runFor(1000);
    await visibility(page, true);
    await visibility(page, false);
    await expect.poll(() => calls).toBe(3);
    await info.attach('foreground-request-ledger', { body: JSON.stringify({ ledger, hiddenClockMs: 90_100,
      simulatedVisibility: true, browserProject: info.project.name }), contentType: 'application/json' });
    await info.attach('visible-membership', { body: await vipScreenshot(page), contentType: 'image/png' });
  });

  for (const hidden of [false, true]) {
    test(`${entry.endpoint} null bootstrap ${hidden ? 'waits while hidden' : 'reads immediately'} and recovers after first failure`, async ({ page, context }, info) => {
      test.skip(!process.env.E2E_CONTRACT_PROXY_URL, 'Requires --contract-proxy for actual SSR bootstrap fault injection.');
      await page.clock.install();
      if (hidden) await page.addInitScript(() => Object.defineProperty(document, 'hidden', { configurable: true, value: true }));
      await setVipBootstrap(context, entry.endpoint, 'vip-null');
      let calls = 0;
      await page.route('**/v1/me/vip', route => ++calls === 1
        ? route.fulfill({ status: 503, json: { message: 'Synthetic unavailable VIP read' } })
        : route.fulfill({ json: vipActive }));
      try {
        await visit(page, entry.path);
        await expectVip(page, entry.endpoint, false);
        if (hidden) {
          expect(calls).toBe(0);
          await page.clock.runFor(60_100);
          expect(calls).toBe(0);
          await visibility(page, false);
        }
        await expect.poll(() => calls).toBe(1);
        if (entry.endpoint === 'center') await expect(page.getByRole('main').getByText('状态待刷新', { exact: true })).toBeVisible();
        else await expect(page.getByText('权益状态暂时无法更新，稍后会自动重试。', { exact: true })).toBeVisible();
        await focus(page, 10);
        await page.clock.runFor(100);
        expect(calls).toBe(1);
        await page.clock.runFor(30_100);
        await expect.poll(() => calls).toBe(2);
        await expectVip(page, entry.endpoint, true);
        await info.attach('unknown-bootstrap-recovered', { body: await vipScreenshot(page), contentType: 'image/png' });
      } finally { await setVipBootstrap(context, entry.endpoint, 'off'); }
    });
  }

  test(`${entry.endpoint} cancels slow hidden read and ignores obsolete 401`, async ({ page }, info) => {
    await page.clock.install();
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let cancelled = 0;
    page.on('requestfailed', request => { if (request.url().endsWith('/me/vip')) cancelled++; });
    await page.route('**/v1/me/vip', async route => {
      if (++calls === 1) { await gate; await route.fulfill({ status: 401, json: { message: 'Obsolete synthetic session' } }); }
      else await route.fulfill({ json: vipActive });
    });
    try {
      await visit(page, entry.path);
      await expectVip(page, entry.endpoint, true);
      if (entry.endpoint === 'center') await readyCenter(page);
      await focus(page, 10);
      await expect.poll(() => calls).toBe(1);
      await visibility(page, true);
      await expect.poll(() => cancelled).toBe(1);
      await page.clock.runFor(90_100);
      expect(calls).toBe(1);
      await expectVip(page, entry.endpoint, true);
      await visibility(page, false);
      await focus(page, 10);
      await expect.poll(() => calls).toBe(2);
      release();
      await expectVip(page, entry.endpoint, true);
      await info.attach('cancelled-read-ledger', { body: JSON.stringify({ calls, cancelled, retainedMembership: true }), contentType: 'application/json' });
    } finally { release(); }
  });

  for (const failure of ['503', 'invalid', 'invalid-date', 'timeout', '401'] as const) {
    test(`${entry.endpoint} ${failure} preserves page-specific semantics and next refresh recovers`, async ({ page }, info) => {
      await page.clock.install();
      let calls = 0;
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      await page.route('**/v1/me/vip', async route => {
        if (++calls > 1) { await route.fulfill({ json: vipActive }); return; }
        if (failure === 'timeout') { await gate; await route.abort(); }
        else if (failure === 'invalid') await route.fulfill({ json: { active: 'invalid' } });
        else if (failure === 'invalid-date') await route.fulfill({ json: { ...vipActive, expiresAt: 'not-a-date' } });
        else await route.fulfill({ status: Number(failure), json: { message: 'Synthetic VIP read failure' } });
      });
      try {
        await visit(page, entry.path);
        await expectVip(page, entry.endpoint, true);
        if (entry.endpoint === 'center') await readyCenter(page);
        await focus(page);
        await expect.poll(() => calls).toBe(1);
        if (failure === 'timeout') await page.clock.runFor(15_100);
        if (failure === '401') await expectVip(page, entry.endpoint, false);
        else if (entry.endpoint === 'center') {
          await expectVip(page, entry.endpoint, false);
          await expect(page.getByRole('main').getByText('状态待刷新', { exact: true })).toBeVisible();
        } else {
          await expectVip(page, entry.endpoint, true);
          await expect(page.getByText('权益状态暂时无法更新，稍后会自动重试。', { exact: true })).toBeVisible();
        }
        // Stop at the next poll; advancing past its deadline can abort the
        // intercepted response before Playwright's route handler is dispatched.
        await page.clock.runFor(failure === 'timeout' ? 15_100 : 30_100);
        await expect.poll(() => calls).toBeGreaterThanOrEqual(2);
        await expectVip(page, entry.endpoint, true);
        await expect(page.getByText('权益状态暂时无法更新，稍后会自动重试。', { exact: true })).toHaveCount(0);
        await info.attach('refresh-recovered', { body: await vipScreenshot(page), contentType: 'image/png' });
      } finally { release(); }
    });
  }

  test(`${entry.endpoint} foreground and background expiry revoke membership locally`, async ({ page, db, account }, info) => {
    const expiresAt = new Date(Date.now() + 10_000);
    await db.vipActivation.updateMany({ where: { userId: account.id }, data: { expiresAt } });
    await page.clock.install();
    let calls = 0;
    await page.route('**/v1/me/vip', async route => {
      calls++;
      await route.fulfill({ json: { ...vipActive, expiresAt: expiresAt.toISOString() } });
    });
    await visit(page, entry.path);
    await expectVip(page, entry.endpoint, true);
    await page.clock.runFor(10_100);
    await expectVip(page, entry.endpoint, false);
    await expect.poll(() => calls).toBe(1);
    // A renewed server result is accepted, then expires during hidden time.
    await page.unroute('**/v1/me/vip');
    const renewedExpiry = new Date(await page.evaluate(() => Date.now()) + 10_000).toISOString();
    await page.route('**/v1/me/vip', route => route.fulfill({ json: { ...vipActive, expiresAt: renewedExpiry } }));
    await page.clock.runFor(1000);
    await focus(page);
    await expectVip(page, entry.endpoint, true);
    await visibility(page, true);
    await page.clock.runFor(15_000);
    await visibility(page, false);
    await focus(page);
    await expectVip(page, entry.endpoint, false);
    await info.attach('expiry-recalibrated', { body: await vipScreenshot(page), contentType: 'image/png' });
  });
}

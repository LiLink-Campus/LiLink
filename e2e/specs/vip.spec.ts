import { expectVip, focus, readyCenter, setVipBootstrap, vipActive, vipPages, visibility } from '../support/vip-refresh';

import { test, expect, api, visit, vipCode, completeProfile } from '../support/fixtures';

test.beforeEach(async ({ signedIn }) => { void signedIn; });

test('VIP activation is persistent and repeated redemption is idempotent @smoke', async ({ page, db }, info) => {
  const code = await vipCode(db);
  await visit(page, '/dashboard/vip');
  await page.getByRole('button', { name: '使用激活码', exact: true }).click();
  await page.getByLabel('VIP 激活码', { exact: true }).fill(code);
  await page.getByRole('button', { name: '确认激活 30 天 VIP', exact: true }).click();
  const firstDialog = page.getByRole('dialog', { name: 'VIP 开通成功' });
  await expect(firstDialog).toBeVisible();
  await expect(firstDialog.getByRole('button', { name: '知道了' })).toBeFocused();
  const first = await (await page.request.get(`${api}/me/vip`)).json();
  expect(first.active).toBe(true);
  await expect(firstDialog.locator('time')).toHaveAttribute('datetime', first.expiresAt);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '使用激活码', exact: true }).click();
  await page.getByLabel('VIP 激活码', { exact: true }).fill(code);
  await page.getByRole('button', { name: '确认激活 30 天 VIP', exact: true }).click();
  const repeated = page.getByRole('dialog', { name: '此激活码已兑换' });
  await expect(repeated).toBeVisible();
  await expect(repeated).toContainText('本次未增加会员时长');
  await repeated.getByRole('button', { name: '知道了' }).click();
  await expect(page.getByRole('button', { name: '使用激活码', exact: true })).toBeFocused();
  const second = await (await page.request.get(`${api}/me/vip`)).json();
  expect(second.expiresAt).toBe(first.expiresAt);
  await visit(page, '/dashboard/me');
  await expect(page.getByRole('main').getByText('已开通', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '账号信息' }).getByLabel('VIP 会员', { exact: true })).toBeVisible();

});

test('expired VIP loses benefits on reload', async ({ page, db, account }) => {
  const grant = await db.vipActivation.create({ data: {
    codeHash: `expiry-${account.id}`, batch: 'e2e', userId: account.id,
    activatedAt: new Date(Date.now() - 86_400_000), expiresAt: new Date(Date.now() + 86_400_000),
  } });
  await visit(page, '/dashboard/me');
  await expect(page.getByRole('main').getByText('已开通', { exact: true })).toBeVisible();
  await db.vipActivation.update({ where: { id: grant.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('main').getByText('已到期', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '账号信息' }).getByLabel('VIP 会员', { exact: true })).toHaveCount(0);
  expect((await (await page.request.get(`${api}/me/vip`)).json()).active).toBe(false);
});

test('advanced filters activation restores its opener and falls back after purchase @smoke @mobile', async ({ page, db }) => {
  await visit(page, '/dashboard/vip');
  const opener = page.getByRole('button', { name: '去开通', exact: true });
  await opener.click();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await opener.click();
  await page.getByRole('button', { name: '关闭激活弹窗' }).click();
  await expect(opener).toBeFocused();
  await opener.click();
  await page.getByLabel('VIP 激活码', { exact: true }).fill(await vipCode(db));
  await page.getByRole('button', { name: '确认激活 30 天 VIP' }).click();
  await page.getByRole('dialog', { name: 'VIP 开通成功' }).getByRole('button', { name: '知道了' }).click();
  await expect(page.getByRole('link', { name: '去设置' })).toBeVisible();
  await expect(page.getByRole('button', { name: '使用激活码', exact: true })).toBeFocused();
});

test('renewal and reactivation show the authoritative expiry @smoke', async ({ page, db, account }, info) => {
  const initialExpiry = new Date(Date.now() + 10 * 86_400_000);
  const original = await db.vipActivation.create({ data: {
    codeHash: `renewal-${account.id}`, batch: 'e2e', userId: account.id,
    activatedAt: new Date(Date.now() - 20 * 86_400_000), expiresAt: initialExpiry,
  } });
  await visit(page, '/dashboard/vip');
  await page.getByRole('button', { name: '使用激活码', exact: true }).click();
  await page.getByLabel('VIP 激活码', { exact: true }).fill(await vipCode(db));
  await page.getByRole('button', { name: '确认激活 30 天 VIP' }).click();
  const renewed = page.getByRole('dialog', { name: 'VIP 续费成功' });
  await expect(renewed).toBeVisible();
  await expect(renewed.locator('time')).toHaveAttribute('datetime', new Date(initialExpiry.getTime() + 30 * 86_400_000).toISOString());
  await expect(renewed).toContainText('原到期时间');

  await renewed.getByRole('button', { name: '知道了' }).click();
  await db.vipActivation.updateMany({ where: { userId: account.id }, data: { activatedAt: new Date(Date.now() - 31 * 86_400_000), expiresAt: new Date(Date.now() - 1000) } });
  // Keep the stale active page to ensure the server determines the outcome.
  const before = Date.now();
  await page.getByRole('button', { name: '使用激活码', exact: true }).click();
  await page.getByLabel('VIP 激活码', { exact: true }).fill(await vipCode(db));
  await page.getByRole('button', { name: '确认激活 30 天 VIP' }).click();
  const restarted = page.getByRole('dialog', { name: 'VIP 开通成功' });
  await expect(restarted).toBeVisible();
  const status = await (await page.request.get(`${api}/me/vip`)).json();
  expect(Date.parse(status.expiresAt)).toBeGreaterThanOrEqual(before + 30 * 86_400_000);
  await expect(restarted.locator('time')).toHaveAttribute('datetime', status.expiresAt);

  expect(await db.vipActivation.findUnique({ where: { id: original.id } })).not.toBeNull();
});

test('account cards align at desktop breakpoints and fit narrow screens', async ({ page, db, account }, info) => {
  await visit(page, '/dashboard/me');
  await expect(page.getByRole('region', { name: '账号信息' }).getByLabel('VIP 会员', { exact: true })).toHaveCount(0);

  await db.vipActivation.create({ data: { codeHash: `layout-${account.id}`, batch: 'e2e', userId: account.id, activatedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 86_400_000) } });
  await page.reload();
  await expect(page.getByRole('region', { name: '账号信息' }).getByLabel('VIP 会员', { exact: true })).toBeVisible();
  for (const width of [320, 879, 880]) {
    await page.setViewportSize({ width, height: 898 });
    const identity = await page.getByRole('region', { name: '账号信息' }).boundingBox();
    const vip = await page.getByRole('region', { name: 'LiLink VIP' }).boundingBox();
    if (width >= 880) {
      expect(Math.abs(identity!.height - vip!.height)).toBeLessThan(1);
      expect(Math.abs(identity!.y - vip!.y)).toBeLessThan(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const badge = page.getByRole('region', { name: '账号信息' }).getByLabel('VIP 会员', { exact: true });
    expect(await badge.evaluate(el => getComputedStyle(el, '::after').animationName)).toBe('none');

  }
});

test('VIP page keeps details collapsed and activation centered @smoke @webkit', async ({ page }, info) => {
  await visit(page, '/dashboard/me');
  await page.getByRole('link', { name: '查看权益与激活' }).click();
  await expect(page).toHaveURL(/\/dashboard\/vip$/);
  await expect(page.getByRole('table', { name: '普通用户与 VIP 权益对比' })).not.toBeVisible();
  for (const width of [320, 880]) {
    await page.setViewportSize({ width, height: 898 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const trigger = page.getByRole('button', { name: '使用激活码', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: '使用激活码', exact: true });
    await expect(page.getByLabel('VIP 激活码', { exact: true })).toBeFocused();
    const bounds = await dialog.boundingBox();
    expect(Math.abs(bounds!.x + bounds!.width / 2 - width / 2)).toBeLessThan(2);
    expect(Math.abs(bounds!.y + bounds!.height / 2 - 898 / 2)).toBeLessThan(2);

    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();

  }
  await page.getByText('VIP 与普通用户有什么区别？', { exact: true }).click();
  await expect(page.getByRole('table', { name: '普通用户与 VIP 权益对比' })).toBeVisible();
  await page.getByText('会员到期后会怎样？', { exact: true }).click();
  await expect(page.getByRole('table', { name: '普通用户与 VIP 权益对比' })).toBeVisible();
  await expect(page.getByText(/会员到期后，优先匹配与高级筛选将停止生效/)).toBeVisible();
  await page.getByText('重复激活如何计算？', { exact: true }).press('Enter');
  await expect(page.getByText(/每张新激活码增加 30 天；有效期内激活/)).toBeVisible();
  await expect(page.getByText(/会员到期后，优先匹配与高级筛选将停止生效/)).toBeVisible();
  const faq = page.getByRole('region', { name: '常见问题', exact: true });
  await expect(faq.locator('details[open]')).toHaveCount(3);
  await page.getByText('重复激活如何计算？', { exact: true }).press('Enter');
  await expect(faq.locator('details[open]')).toHaveCount(2);
  await expect(page.getByRole('table', { name: '普通用户与 VIP 权益对比' })).toBeVisible();
  await expect(page.getByText(/会员到期后，优先匹配与高级筛选将停止生效/)).toBeVisible();

});

test('profile keeps verified VIP state through transient reads and expiry remains authoritative', async ({ page, context, db, account }) => {
  await page.clock.install();
  await completeProfile(context, db);
  await db.vipActivation.create({ data: { codeHash: `performance-${account.id}`, userId: account.id, activatedAt: new Date(Date.now() - 86_400_000), expiresAt: new Date(Date.now() + 60_000), batch: 'e2e-performance' } });
  await visit(page, '/dashboard/profile');
  await expect(page.getByText('全部修改已保存', { exact: true }).filter({ visible: true })).toBeVisible();
  // The SSR save notice is visible before the profile can handle focus events.
  await expect(page.getByRole('textbox', { name: '昵称', exact: true })).toBeEditable();
  const directory = page.getByRole('button', { name: '题目目录', exact: true });
  if (await directory.isVisible()) await directory.click();
  await page.getByRole('button', { name: /第 \d+ 题：希望对方的身高范围$/ }).filter({ visible: true }).click();
  const activeBenefits = page.getByText('高级筛选 · VIP 已启用', { exact: true });
  await expect(activeBenefits.filter({ visible: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
  let requests = 0;
  await page.route('**/v1/me/vip', async route => {
    requests++;
    await route.fulfill({ status: 503, json: { message: 'Temporary outage' } });
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => requests).toBe(1);
  await expect(page.getByText('权益状态暂时无法更新，稍后会自动重试。')).toBeVisible();
  await expect(activeBenefits.filter({ visible: true })).toBeVisible();
  await db.vipActivation.updateMany({ where: { userId: account.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await page.unroute('**/v1/me/vip');
  // A later foreground event is independent of the coalesced focus burst.
  await page.clock.runFor(1000);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('权益状态暂时无法更新，稍后会自动重试。')).toHaveCount(0);
  await expect(activeBenefits.filter({ visible: true })).toHaveCount(0);
  await expect(page.getByText('高级筛选 · 需要 VIP，开通后可设置', { exact: true }).filter({ visible: true })).toBeVisible();
  expect((await (await context.request.get(`${api}/me/vip`)).json()).active).toBe(false);
});

test('profile pauses hidden VIP polling and ignores the cancelled response after resume', async ({ page, signedIn, account, context, db }) => {
  void signedIn;
  await completeProfile(context, db);
  await db.vipActivation.create({ data: { codeHash: `polling-${account.id}`, userId: account.id, activatedAt: new Date(), expiresAt: new Date(Date.now() + 3600_000), batch: 'e2e-polling' } });
  await page.clock.install();
  await visit(page, '/dashboard/profile');
  await expect(page.getByText('全部修改已保存', { exact: true }).filter({ visible: true })).toBeVisible();
  const directory = page.getByRole('button', { name: '题目目录', exact: true });
  if (await directory.isVisible()) await directory.click();
  await page.getByRole('button', { name: /第 \d+ 题：希望对方的身高范围$/ }).filter({ visible: true }).click();
  const enabled = page.getByRole('main').getByText('高级筛选 · VIP 已启用', { exact: true }).filter({ visible: true });
  await expect(enabled).toBeVisible();
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/v1/me/vip', async route => {
    const number = ++calls;
    if (number === 1) {
      await gate;
      await route.fulfill({ status: 401, json: { message: 'Obsolete session response' } });
    } else await route.continue();
  });
  try {
    await page.evaluate(() => { for (let n = 0; n < 10; n++) window.dispatchEvent(new Event('focus')); });
    await expect.poll(() => calls).toBe(1);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.runFor(31_000);
    expect(calls).toBe(1);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(() => calls).toBe(2);
    release();
    await expect(enabled).toBeVisible();
    await expect(page.getByRole('main').getByText('高级筛选 · 需要 VIP，开通后可设置', { exact: true }).filter({ visible: true })).toHaveCount(0);
  } finally { release(); }
});

test.describe('VIP read lifecycle', () => {
 test.beforeEach(async ({ context, db, account }) => {
 await completeProfile(context, db);
 await db.vipActivation.create({ data: { codeHash: `refresh-${account.id}`, batch: 'e2e-refresh', userId: account.id, activatedAt: new Date(), expiresAt: new Date('2030-01-01') } });
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

  });

  for (const hidden of [false, true]) {
    test(`${entry.endpoint} null bootstrap ${hidden ? 'waits while hidden' : 'reads immediately'} and recovers after first failure`, async ({ page, context }, info) => {
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

  for (const failure of ['503', 'timeout', '401'] as const) {
    test(`${entry.endpoint} ${failure} preserves page-specific semantics and next refresh recovers`, async ({ page }, info) => {
      await page.clock.install();
      let calls = 0;
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      await page.route('**/v1/me/vip', async route => {
        if (++calls > 1) { await route.fulfill({ json: vipActive }); return; }
        if (failure === 'timeout') { await gate; await route.abort(); }
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
        if (failure === 'timeout') release();
        // A poll's origin is client effect installation, not navigation. Step
        // through one interval so the real route can settle before its deadline.
        let recoveryClockMs = 0;
        while (calls < 2 && recoveryClockMs < 30_000) {
          await page.clock.runFor(1000);
          recoveryClockMs += 1000;
        }
        await expect.poll(() => calls).toBe(2);
        await expectVip(page, entry.endpoint, true);
        await expect(page.getByText('权益状态暂时无法更新，稍后会自动重试。', { exact: true })).toHaveCount(0);
        await info.attach('automatic-refresh-recovery', { contentType: 'application/json',
          body: JSON.stringify({ failure, calls, recoveryClockMs, maxRecoveryClockMs: 30_000 }) });

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

  });
}

});

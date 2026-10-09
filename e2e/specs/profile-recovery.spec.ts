import { HARD_MATCH_KEYS } from '@lilink/shared';
import { test, expect, api, visit, completeProfile } from '../support/fixtures';
import { focus, vipInactive } from '../support/vip-refresh';
import type { Page } from '@playwright/test';
test.beforeEach(async ({ signedIn }) => { void signedIn; });
async function openQuestion(page: Page, title: string, module = '关于你') {
 await expect(page.getByRole('region', { name: '当前题目' })).toBeVisible();
 const directory = page.getByRole('button', { name: '题目目录', exact: true });
 if (await directory.isVisible()) await directory.click();
 await page.getByRole('button', { name: new RegExp(`${module}第 \\d+ 题：${title}$`) }).filter({ visible: true }).click();
}

type CountdownLayoutSample = { state: 'pending' | 'ready'; y: number; height: number; frame: number };
type CountdownLayoutEvidence = { samples: CountdownLayoutSample[]; complete: boolean };

// Failure boundary: initializing the countdown must not move the visible
// confirmation action. Streaming may keep the placeholder hidden until after
// hydration; only frames with a visible action can establish a layout baseline.
test('home confirmation action stays in place when the countdown initializes @smoke', async ({ page, context, db, account, signedIn }, info) => {
  void signedIn;
  await completeProfile(context, db);
  await db.user.update({ where: { id: account.id }, data: { displayName: '短' } });
  const response = await db.questionnaireResponse.findUniqueOrThrow({ where: { userId: account.id } });
  await db.questionnaireResponse.update({ where: { userId: account.id }, data: {
    acknowledgedHardMatchSignatures: { ...response.acknowledgedHardMatchSignatures, [HARD_MATCH_KEYS.gender]: 'outdated-signature' },
  } });
  await page.addInitScript(() => {
    if (location.pathname !== '/dashboard') return;
    const evidence: CountdownLayoutEvidence = { samples: [], complete: false };
    Object.defineProperty(window, '__countdownLayoutEvidence', { value: evidence });
    let frame = 0;
    let readyFrames = 0;
    function observe() {
      frame++;
      const action = [...document.querySelectorAll('a')]
        .find(element => /^去确认这\s*1\s*项/.test(element.textContent?.trim() ?? ''));
      if (action) {
        const box = action.getBoundingClientRect();
        const style = getComputedStyle(action);
        const section = action.closest('section');
        const ready = section?.querySelector('[aria-label="距揭晓"]');
        const pending = [...(section?.querySelectorAll('span') ?? [])]
          .some(element => element.textContent?.trim() === '计算中');
        if (box.width > 0 && box.height > 0 && style.visibility === 'visible'
          && !action.closest('[hidden], [inert], [aria-hidden="true"]') && (ready || pending)) {
          evidence.samples.push({ state: ready ? 'ready' : 'pending', y: box.y, height: box.height, frame });
          readyFrames = ready ? readyFrames + 1 : 0;
          if (readyFrames >= 3) { evidence.complete = true; return; }
        }
      }
      requestAnimationFrame(observe);
    }
    requestAnimationFrame(observe);
  });
  await visit(page, '/dashboard');
  await page.waitForFunction(() => (window as typeof window & {
    __countdownLayoutEvidence?: CountdownLayoutEvidence;
  }).__countdownLayoutEvidence?.complete);
  const observed = await page.evaluate(() => (window as typeof window & {
    __countdownLayoutEvidence: CountdownLayoutEvidence;
  }).__countdownLayoutEvidence);
  const action = page.getByRole('link', { name: /去确认这 1 项/ });
  await expect(action).toBeVisible();
  await expect(page.getByLabel('距揭晓', { exact: true })).toBeVisible();

  const before = observed.samples[0];
  const after = await action.boundingBox();
  expect(before).toBeDefined();
  expect(after).not.toBeNull();
  await info.attach('countdown-action-position', { body: JSON.stringify({
    project: info.project.name, viewport: page.viewportSize(),
    placeholderPainted: observed.samples.some(sample => sample.state === 'pending'),
    samples: observed.samples,
    before: { y: before.y, height: before.height }, after: { y: after!.y, height: after!.height },
  }), contentType: 'application/json' });
  for (const sample of observed.samples) expect(Math.abs(sample.y - before.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(after!.y - before.y)).toBeLessThanOrEqual(1);
  await action.click();
  await expect(page).toHaveURL(/\/dashboard\/profile(?:#.*)?$/);
  await expect(page.getByRole('group', { name: '性别', exact: true })).toBeInViewport();
});

test('profile recovers after a committed acknowledgement response stalls @smoke', async ({ page, context, db, account, signedIn }, info) => {
  void signedIn;
  await completeProfile(context, db);
  await db.user.update({ where: { id: account.id }, data: { displayName: '短' } });
  const response = await db.questionnaireResponse.findUniqueOrThrow({ where: { userId: account.id } });
  await db.questionnaireResponse.update({ where: { userId: account.id }, data: {
    acknowledgedHardMatchSignatures: { ...response.acknowledgedHardMatchSignatures, [HARD_MATCH_KEYS.gender]: 'outdated-signature' },
  } });
  let release!: () => void;
  let responseReleased = false;
  const gate = new Promise<void>(resolve => { release = () => { responseReleased = true; resolve(); }; });
  let committed = false;
  await page.route(`${api}/me/questionnaire/acknowledgement`, async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    expect(route.request().postDataJSON()).toEqual({ versionId: response.versionId, keys: [HARD_MATCH_KEYS.gender] });
    const actual = await route.fetch();
    expect(actual.ok()).toBeTruthy();
    expect((await actual.json()).acknowledgedKeys).toContain(HARD_MATCH_KEYS.gender);
    committed = true;
    await gate;
    await route.fulfill({ response: actual });
  });
  try {
    await visit(page, '/dashboard');
    await page.getByRole('link', { name: /去确认这 1 项/ }).click();
    await expect(page).toHaveURL(/\/dashboard\/profile(?:#.*)?$/);
    await expect(page.getByRole('group', { name: '性别', exact: true })).toBeInViewport();
    await expect.poll(() => committed).toBe(true);
    await page.getByRole('link', { name: '我的匹配', exact: true }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/match$/);
    const [recovery] = await Promise.all([
      page.waitForResponse(result => result.url() === `${api}/me/page-bootstrap/profile` && result.request().method() === 'GET' && result.ok(), { timeout: 20_000 }),
      (async () => {
        await page.goBack();
        await expect(page.getByRole('region', { name: '同步最新资料' })).toBeVisible();
      })(),
    ]);
    const server = await recovery.json();
    expect(server.user.id).toBe(account.id);
    expect(server.savedQuestionnaire.attention.pendingUpdatedKeys).not.toContain(HARD_MATCH_KEYS.gender);
    await expect(page.getByRole('textbox', { name: '昵称', exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('textbox', { name: '昵称', exact: true })).toBeEditable();
    expect(responseReleased).toBe(false);
    await info.attach('confirmation-timeout-recovery', { body: JSON.stringify({
      serverConfirmationCommitted: committed,
      serverNoLongerNeedsGenderConfirmation: true,
      editorRecoveredBeforeOriginalResponseReleased: true,
      authoritativeReadStatus: recovery.status(),
      originalResponseReleased: responseReleased,
    }), contentType: 'application/json' });

    release();
    await expect(page.getByRole('textbox', { name: '昵称', exact: true })).toBeVisible();
  } finally {
    release();
    if (!page.isClosed()) await page.unrouteAll({ behavior: 'wait' });
  }
});

test('home accepts a fresh server snapshot after focus revalidation', async ({ page, account, db }) => {
  await page.clock.install();
  await visit(page, '/dashboard');
  await expect(page.getByRole('main')).toContainText('自动化同学');
  // SSR text precedes the effects that initialize the focus refresh TTL.
  await expect(page.getByLabel('距揭晓', { exact: true })).toBeVisible();
  await db.user.update({ where: { id: account.id }, data: { displayName: '重新验证后的昵称' } });
  await page.clock.fastForward(31_000);
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('main')).toContainText('重新验证后的昵称');
});

test('a late profile save settles before a returning editor mounts old data', async ({ page, context, db }, info) => {
  await completeProfile(context, db);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let stored = false;
  await page.route('**/api/questionnaire', async route => {
    const actual = await route.fetch();
    expect(actual.ok()).toBeTruthy();
    stored = true;
    await gate;
    await route.fulfill({ response: actual });
  });
  try {
    await visit(page, '/dashboard/profile');
    await page.getByRole('textbox', { name: '昵称', exact: true }).fill('迟到的保存结果');
    await expect.poll(() => stored).toBe(true);
    await page.getByRole('link', { name: '我的匹配', exact: true }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/match$/);
    await page.goBack();
    await expect(page.getByRole('textbox', { name: '昵称', exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: '同步最新资料' })).toBeVisible();

    release();
    await expect(page.getByRole('textbox', { name: '昵称', exact: true })).toHaveValue('迟到的保存结果');
  } finally { release(); }
});

for (const delayed of [true]) {
  test(`acknowledging updated fields refreshes cached home (late response: ${delayed})`, async ({ page, context, db, account }) => {
    await completeProfile(context, db);
    // Home exposes confirmation actions while the profile still needs completion.
    await db.user.update({ where: { id: account.id }, data: { displayName: '短' } });
    const response = await db.questionnaireResponse.findUniqueOrThrow({ where: { userId: account.id } });
    await db.questionnaireResponse.update({ where: { userId: account.id }, data: { acknowledgedHardMatchSignatures: { ...response.acknowledgedHardMatchSignatures, [HARD_MATCH_KEYS.gender]: 'outdated-signature' } } });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let acknowledged = false;
    let answerWrites = 0;
    page.on('request', request => {
      if (request.method() === 'PUT' && /\/(api\/questionnaire|v1\/me\/questionnaire)$/.test(new URL(request.url()).pathname)) answerWrites++;
    });
    await page.route(`${api}/me/questionnaire/acknowledgement`, async route => {
      const actual = await route.fetch();
      expect(actual.ok()).toBeTruthy();
      acknowledged = true;
      if (delayed) await gate;
      await route.fulfill({ response: actual });
    });
    try {
      await visit(page, '/dashboard');
      await expect(page.getByRole('link', { name: /去确认这 1 项/ })).toBeVisible();
      const acknowledgement = page.waitForResponse(response => response.url() === `${api}/me/questionnaire/acknowledgement`);
      await page.getByRole('link', { name: /去确认这 1 项/ }).click();
      await expect.poll(() => acknowledged).toBe(true);
      if (!delayed) await acknowledgement;
      await page.goBack();
      await expect(page).toHaveURL(/\/dashboard$/);
      release();
      await acknowledgement;
      await expect(page.getByRole('link', { name: /去确认这 1 项/ })).toHaveCount(0);
      await expect(page.getByRole('link', { name: '继续填写', exact: true })).toBeVisible();
      expect(answerWrites).toBe(0);
      const latest = await (await context.request.get(`${api}/me/page-bootstrap/home`)).json();
      expect(latest.questionnaireAttention.pendingUpdatedKeys).not.toContain(HARD_MATCH_KEYS.gender);
    } finally { release(); }
  });
}

test('VIP revocation during automatic navigation leaves a visible editable question @mobile', async ({ page, context, db, account }, info) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await completeProfile(context, db);
      await db.vipActivation.create({ data: { codeHash: `reader-${account.id}`, batch: 'e2e-reader',
        userId: account.id, activatedAt: new Date(), expiresAt: new Date('2030-01-01') } });
      await visit(page, '/dashboard/profile');
      await openQuestion(page, '性别');
      const leaving = page.getByRole('radio', { name: '男', exact: true }).locator('xpath=ancestor::*[@data-reader-item][1]');
      await page.route('**/v1/me/vip', route => route.fulfill({ json: vipInactive }));
      await page.getByRole('radio', { name: '男', exact: true }).check();
      if (true) {
        await expect.poll(() => leaving.evaluate(node => node.getAnimations().some(animation => animation.playState === 'running')),
          { intervals: [10], timeout: 3000 }).toBe(true);
      }
      const refreshed = page.waitForResponse(response => response.url().endsWith('/me/vip') && response.ok());
      await focus(page);
      await refreshed;
      await expect(page.getByRole('main').locator('[data-reader-item]').filter({ hasText: '希望对方锻炼频率' })).toContainText('需要 VIP，开通后可设置');
      await expect(leaving).toBeVisible();
      await expect(leaving).toHaveCSS('opacity', '1');
      await expect.poll(() => leaving.evaluate(node => node.getAnimations().length)).toBe(0);
      await expect(page.getByRole('radio', { name: '男', exact: true })).toBeChecked();
      await expect(page.locator('[data-reader-hidden="false"]')).toHaveCount(1);
      await openQuestion(page, '希望对方锻炼频率', '希望遇见谁');
      await expect(page.getByText('高级筛选 · 需要 VIP，开通后可设置', { exact: true }).filter({ visible: true })).toBeVisible();
      await openQuestion(page, '一句话介绍');
      const intro = page.getByRole('textbox', { name: /一句话介绍/ });
      await expect(intro).toBeEditable();
      await intro.fill('权益变化之后仍可填写');
      await expect(page.getByRole('main').getByText('全部修改已保存', { exact: true })).toBeVisible();
      await expect(intro).toHaveValue('权益变化之后仍可填写');

    });

test('browser refresh rejects invalid bootstrap, then accepts compatible fields on retry', async ({ page, context, db, signedIn }, info) => {
  void signedIn;
  await completeProfile(context, db);
  await visit(page, '/dashboard/profile');
  await page.route('**/v1/me/page-bootstrap/home', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), contactPreferences: { revision: -1 } } });
  });
  const name = page.getByRole('textbox', { name: '昵称', exact: true });
  await name.fill('协议验收同学');
  await expect(page.getByRole('main').getByText('全部修改已保存', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '首页', exact: true }).first().click();
  await expect(page.getByRole('main').getByRole('alert')).toHaveText('服务返回的数据格式异常，请重试。');

  await page.unroute('**/v1/me/page-bootstrap/home');
  await page.route('**/v1/me/page-bootstrap/home', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), futureField: true } });
  });
  await page.getByRole('button', { name: '重试加载最新资料', exact: true }).click();
  await expect(page.getByRole('main')).toContainText('协议验收同学');
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

test('stalled match estimate times out and focus can start a fresh read', async ({ page, signedIn, account, context, db }, info) => {
  void signedIn;
  await completeProfile(context, db);
  await db.vipActivation.create({ data: { codeHash: `estimate-${account.id}`, userId: account.id,
    activatedAt: new Date(), expiresAt: new Date(Date.now() + 3600_000), batch: 'e2e-estimate' } });
  await page.clock.install();
  let release!: () => void;
  const stalled = new Promise<void>(resolve => { release = resolve; });
  let attempts = 0;
  let cancelled = false;
  page.on('requestfailed', request => { if (request.url().endsWith('/me/match-estimate')) cancelled = true; });
  await page.route('**/v1/me/match-estimate', async route => {
    if (++attempts === 1) { await stalled; await route.abort(); }
    else await route.fulfill({ json: { available: true, band: 'HIGH', lowConfidence: false } });
  });
  try {
    await visit(page, '/dashboard/profile');
    await expect(page.getByText('全部修改已保存', { exact: true }).filter({ visible: true })).toBeVisible();
    await page.clock.runFor(500);
    await expect.poll(() => attempts).toBe(1);
    await page.clock.fastForward(15_100);
    await expect.poll(() => cancelled).toBeTruthy();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.clock.runFor(500);
    await expect.poll(() => attempts).toBe(2);
    await expect(page.getByText('排除后匹配到的概率：', { exact: true })).toHaveCount(1);
    await info.attach('estimate-timeout-recovery', { contentType: 'application/json', body: JSON.stringify({
      attempts, cancelled, recoveredEstimate: true, browserProject: info.project.name,
    }) });
  } finally { release(); }
});

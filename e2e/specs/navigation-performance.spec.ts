import { HARD_MATCH_KEYS } from "@lilink/shared";
import { test, expect, completeProfile, visit, api } from '../support/fixtures';

test.beforeEach(async ({ signedIn }) => { void signedIn; });

test('home accepts a fresh server snapshot after focus revalidation', async ({ page, account, db }) => {
  await page.clock.install();
  await visit(page, '/dashboard');
  await expect(page.getByRole('main')).toContainText('自动化同学');
  await db.user.update({ where: { id: account.id }, data: { displayName: '重新验证后的昵称' } });
  await page.clock.fastForward(31_000);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('main')).toContainText('重新验证后的昵称');
});

test('soft navigation and back retain a saved profile with bounded private prefetch', async ({ page, context, db }, info) => {
  await completeProfile(context, db);
  const requests: { path: string; rsc: boolean; prefetch: boolean; atMs: number }[] = [];
  const started = performance.now();
  page.on('request', request => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/dashboard')) return;
    const headers = request.headers();
    requests.push({ path: url.pathname, rsc: headers.rsc === '1',
      prefetch: headers['next-router-prefetch'] === '1', atMs: Math.round(performance.now() - started) });
  });
  await visit(page, '/dashboard');
  await expect(page.getByRole('main')).toContainText('自动化同学');
  const profileLink = page.getByRole('link', { name: '我的资料', exact: true }).filter({ visible: true }).first();
  await profileLink.focus();
  const profileStart = performance.now();
  await profileLink.click();
  const name = page.getByRole('textbox', { name: '昵称', exact: true });
  await expect(name).toHaveValue('自动化同学');
  const profileReadyMs = Math.round(performance.now() - profileStart);
  await name.fill('导航后保留的昵称');
  await expect(page.getByText('全部修改已保存', { exact: true }).filter({ visible: true })).toBeVisible();
  const matchStart = performance.now();
  await page.getByRole('link', { name: '我的匹配', exact: true }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/dashboard\/match$/);
  await expect(page.getByRole('main')).toContainText('匹配');
  const matchReadyMs = Math.round(performance.now() - matchStart);
  const backStart = performance.now();
  await page.goBack();
  await expect(name).toHaveValue('导航后保留的昵称');
  await expect(name).toBeEditable();
  const backReadyMs = Math.round(performance.now() - backStart);
  expect(requests.filter(request => request.path.includes('/coupons'))).toHaveLength(0);
  await info.attach('navigation-timing', { body: JSON.stringify({
    browser: info.project.name, viewport: page.viewportSize(), network: 'local unthrottled',
    profileReadyMs, matchReadyMs, backReadyMs, requests,
    notes: 'Production build; default Next Link prefetch; no extra private data cache; timings are observations, not a production SLA.'
  }), contentType: 'application/json' });
  await info.attach('profile-after-back', { body: await page.screenshot(), contentType: 'image/png' });
});


for (const delayed of [false, true]) {
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
    await info.attach('profile-awaiting-previous-save', { body: await page.screenshot(), contentType: 'image/png' });
    release();
    await expect(page.getByRole('textbox', { name: '昵称', exact: true })).toHaveValue('迟到的保存结果');
  } finally { release(); }
});

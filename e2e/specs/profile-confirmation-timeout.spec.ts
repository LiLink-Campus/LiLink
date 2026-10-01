import { HARD_MATCH_KEYS } from '@lilink/shared';
import { test, expect, api, completeProfile, visit } from '../support/fixtures';

test('home confirmation action stays in place when the countdown initializes @smoke', async ({ page, context, db, account, signedIn }, info) => {
  void signedIn;
  await completeProfile(context, db);
  await db.user.update({ where: { id: account.id }, data: { displayName: '短' } });
  const response = await db.questionnaireResponse.findUniqueOrThrow({ where: { userId: account.id } });
  await db.questionnaireResponse.update({ where: { userId: account.id }, data: {
    acknowledgedHardMatchSignatures: { ...response.acknowledgedHardMatchSignatures, [HARD_MATCH_KEYS.gender]: 'outdated-signature' },
  } });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/_next/static/chunks/*.js', async route => {
    await gate;
    await route.continue();
  });
  try {
    await visit(page, '/dashboard');
    await expect(page.getByText('计算中', { exact: true })).toBeVisible();
    const action = page.getByRole('link', { name: /去确认这 1 项/ });
    const before = await action.boundingBox();
    expect(before).not.toBeNull();
    release();
    await expect(page.getByLabel('距揭晓', { exact: true })).toBeVisible();
    await info.attach('countdown-after-initialization', { body: await page.screenshot(), contentType: 'image/png' });
    const after = await action.boundingBox();
    expect(after).not.toBeNull();
    await info.attach('countdown-action-position', { body: JSON.stringify({
      project: info.project.name, viewport: page.viewportSize(),
      before: { y: before!.y, height: before!.height }, after: { y: after!.y, height: after!.height },
    }), contentType: 'application/json' });
    expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1);
    await action.click();
    await expect(page).toHaveURL(/\/dashboard\/profile(?:#.*)?$/);
    await expect(page.getByRole('group', { name: '性别', exact: true })).toBeInViewport();
  } finally {
    release();
    if (!page.isClosed()) await page.unrouteAll({ behavior: 'wait' });
  }
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
    await info.attach('profile-after-confirmation-timeout', { body: await page.screenshot(), contentType: 'image/png' });
    release();
    await expect(page.getByRole('textbox', { name: '昵称', exact: true })).toBeVisible();
  } finally {
    release();
    if (!page.isClosed()) await page.unrouteAll({ behavior: 'wait' });
  }
});

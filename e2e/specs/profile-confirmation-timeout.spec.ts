import { HARD_MATCH_KEYS } from '@lilink/shared';
import { test, expect, api, completeProfile, visit } from '../support/fixtures';

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
  await info.attach('countdown-after-initialization', { body: await page.screenshot(), contentType: 'image/png' });
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
    await info.attach('profile-after-confirmation-timeout', { body: await page.screenshot(), contentType: 'image/png' });
    release();
    await expect(page.getByRole('textbox', { name: '昵称', exact: true })).toBeVisible();
  } finally {
    release();
    if (!page.isClosed()) await page.unrouteAll({ behavior: 'wait' });
  }
});

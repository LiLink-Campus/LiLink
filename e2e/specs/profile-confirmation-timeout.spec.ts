import { HARD_MATCH_KEYS } from '@lilink/shared';
import { test, expect, api, completeProfile, visit } from '../support/fixtures';

test('profile recovers after a committed acknowledgement response stalls @smoke', async ({ page, context, db, account, signedIn }, info) => {
  void signedIn;
  await completeProfile(context, db);
  await db.user.update({ where: { id: account.id }, data: { displayName: '短' } });
  const response = await db.questionnaireResponse.findUniqueOrThrow({ where: { userId: account.id } });
  await db.questionnaireResponse.update({ where: { userId: account.id }, data: {
    acknowledgedHardMatchSignatures: { ...response.acknowledgedHardMatchSignatures, [HARD_MATCH_KEYS.gender]: 'outdated-signature' },
  } });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let committed = false;
  let clientRereads = 0;
  page.on('request', request => {
    if (request.url() === `${api}/me/page-bootstrap/profile`) clientRereads += 1;
  });
  await page.route(`${api}/me/questionnaire/acknowledgement`, async route => {
    const actual = await route.fetch();
    expect(actual.ok()).toBeTruthy();
    committed = true;
    await gate;
    await route.fulfill({ response: actual });
  });
  try {
    await visit(page, '/dashboard');
    await page.getByRole('link', { name: /去确认这 1 项/ }).click();
    await expect.poll(() => committed).toBe(true);
    await page.getByRole('link', { name: '我的匹配', exact: true }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/match$/);
    await page.goBack();
    await expect(page.getByRole('region', { name: '同步最新资料' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: '昵称', exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('textbox', { name: '昵称', exact: true })).toBeEditable();
    expect(clientRereads).toBeGreaterThan(0);
    const server = await (await context.request.get(`${api}/me/page-bootstrap/profile`)).json();
    expect(server.savedQuestionnaire.attention.pendingUpdatedKeys).not.toContain(HARD_MATCH_KEYS.gender);
    await info.attach('confirmation-timeout-recovery', { body: JSON.stringify({
      serverConfirmationCommitted: committed,
      serverNoLongerNeedsGenderConfirmation: true,
      editorRecoveredBeforeOriginalResponseReleased: true,
      authoritativeReadCount: clientRereads,
    }), contentType: 'application/json' });
    await info.attach('profile-after-confirmation-timeout', { body: await page.screenshot(), contentType: 'image/png' });
    release();
    await expect(page.getByRole('textbox', { name: '昵称', exact: true })).toBeVisible();
  } finally { release(); }
});

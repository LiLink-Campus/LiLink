import { randomUUID } from 'node:crypto';
import { test, expect, api, visit } from '../support/fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// Identity boundaries: VIP and education are independent; loading failure
// must not falsely label an account, and the card must not duplicate badges.
test('account names show independent badges and education reads can retry @mobile @webkit', async ({ page, db, account, signedIn }, info) => {
  void signedIn;
  const activation = await db.vipActivation.create({ data: {
    codeHash: randomUUID(), batch: 'badge-e2e', userId: account.id,
    activatedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000),
  } });
  const states = [[true, false], [true, true], [false, true], [false, false]] as const;
  for (const [vip, education] of states) {
    await db.vipActivation.update({ where: { id: activation.id }, data: { revokedAt: vip ? null : new Date() } });
    await db.user.update({ where: { id: account.id }, data: {
      educationVerifiedAt: education ? new Date() : null,
      educationVerificationMethod: education ? 'LEGACY' : null,
    } });
    let reads = 0;
    const count = (request: { url(): string }) => { if (request.url() === `${api}/me/education`) reads++; };
    page.on('request', count);
    await visit(page, '/dashboard/me');
    const identity = page.getByRole('region', { name: '账号信息', exact: true });
    const label = education ? '教育用户' : '非教育用户';
    await expect(identity.getByText(label, { exact: true })).toBeVisible();
    await expect(identity.getByLabel('VIP 会员', { exact: true })).toHaveCount(vip ? 1 : 0);
    const card = page.getByRole('region', { name: '教育认证', exact: true });
    await expect(card.getByLabel('VIP 会员', { exact: true })).toHaveCount(0);
    await expect(card.getByText(label, { exact: true })).toHaveCount(0);
    expect(reads).toBe(1);
    page.off('request', count);
    for (const width of info.project.name === 'chromium' ? [320, 375, 766, 880, 1280] : [page.viewportSize()!.width]) {
      await page.setViewportSize({ width, height: 896 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await info.attach(`account-badges-${vip}-${education}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  }
  let fail = true;
  await page.route(`${api}/me/education`, route => fail
    ? route.fulfill({ status: 503, json: { message: 'Synthetic unavailable' } })
    : route.continue());
  await visit(page, '/dashboard/me');
  const identity = page.getByRole('region', { name: '账号信息', exact: true });
  const card = page.getByRole('region', { name: '教育认证', exact: true });
  await expect(card.getByRole('alert')).toBeVisible();
  await expect(identity.getByText('非教育用户', { exact: true })).toHaveCount(0);
  fail = false;
  await card.getByRole('button', { name: '重试认证状态' }).click();
  await expect(identity.getByText('非教育用户', { exact: true })).toBeVisible();
  await expect(card.getByRole('alert')).toHaveCount(0);
  await info.attach('independent-account-badge-contract', { contentType: 'application/json', body: JSON.stringify({ states, assertions: { adjacentToAccountName: true, vipAbsentWhenInactive: true, oneEducationReadPerPage: true, noDuplicateCardBadge: true, retryWithoutFalseIdentity: true, noHorizontalOverflow: true } }) });
});

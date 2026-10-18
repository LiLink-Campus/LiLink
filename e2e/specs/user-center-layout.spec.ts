import { test, expect, visit, api, password } from '../support/fixtures';

// A hanging deletion must release modal controls and confirm the session before
// retrying; a committed deletion with a lost response must finish the exit.
test('stalled account deletion requires confirmation before explicit retry @mobile @webkit', async ({ page, account, signedIn }, info) => {
  void signedIn;
  await visit(page, '/dashboard/me');
  await page.clock.install();
  await page.getByRole('button', { name: /账号菜单/ }).click();
  await page.getByRole('menuitem', { name: '注销账号', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '注销账号', exact: true });
  await dialog.getByLabel('当前登录密码').fill(password);
  await dialog.getByLabel('输入“注销账号”确认').fill('注销账号');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let writes = 0;
  let readFails = true;
  await page.route(`${api}/me/account`, async route => {
    if (++writes === 1) { await gate; await route.abort(); }
    else await route.continue();
  });
  await page.route(`${api}/auth/me`, route => readFails ? route.fulfill({ status: 503, json: { message: 'Synthetic unavailable' } }) : route.continue());
  try {
    await dialog.getByRole('button', { name: '确认注销账号', exact: true }).click();
    await expect.poll(() => writes).toBe(1);
    await expect(dialog.getByRole('button', { name: '暂不注销，返回' })).toBeDisabled();
    await page.clock.fastForward(15_100);
    await expect(dialog.getByRole('alert')).toContainText('注销结果待确认');
    await expect(dialog.getByRole('button', { name: '暂不注销，返回' })).toBeEnabled();
    await expect(dialog.getByRole('button', { name: '确认注销账号', exact: true })).toBeDisabled();
    readFails = false;
    await dialog.getByRole('button', { name: '重新确认账号状态', exact: true }).click();
    await expect(dialog.getByRole('button', { name: '确认注销账号', exact: true })).toBeEnabled();
    expect(writes).toBe(1);
    await dialog.getByRole('button', { name: '确认注销账号', exact: true }).click();
    await expect(page).toHaveURL('/');
    expect((await page.request.post(`${api}/auth/login`, { data: { email: account.email, password } })).ok()).toBe(false);
    await info.attach('deletion-explicit-retry', { contentType: 'application/json', body: JSON.stringify({ boundedWait: true, controlsRecovered: true, noAutomaticDeletionRetry: true, authoritativeConfirmationRequired: true, deletedAccountCannotLogin: true, browserProject: info.project.name }) });
  } finally { release(); }
});

test('committed account deletion with a stalled response reconciles and exits @mobile @webkit', async ({ page, db, account, signedIn }, info) => {
  void signedIn;
  await visit(page, '/dashboard/me');
  await page.clock.install();
  await page.getByRole('button', { name: /账号菜单/ }).click();
  await page.getByRole('menuitem', { name: '注销账号', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '注销账号', exact: true });
  await dialog.getByLabel('当前登录密码').fill(password);
  await dialog.getByLabel('输入“注销账号”确认').fill('注销账号');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let committed = false;
  let writes = 0;
  await page.route(`${api}/me/account`, async route => {
    writes++;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    committed = true;
    await gate;
    await route.fulfill({ response });
  });
  try {
    await dialog.getByRole('button', { name: '确认注销账号', exact: true }).click();
    await expect.poll(() => committed).toBe(true);
    await page.clock.fastForward(15_100);
    await expect(page).toHaveURL('/');
    expect((await db.user.findUniqueOrThrow({ where: { id: account.id } })).deactivatedAt).not.toBeNull();
    expect(writes).toBe(1);
    await info.attach('deletion-committed-timeout', { contentType: 'application/json', body: JSON.stringify({ committedResponseLost: true, sessionReadConfirmedExit: true, writes, browserProject: info.project.name }) });
  } finally { release(); }
});

// Visible boundaries: 93px benefit heights, breakpoint overflow, dialog dismissal,
// keyboard focus restoration, and preserving VIP placement.
test('user center separates compact benefit cards and account menu actions @mobile @webkit', async ({ page, db, account, signedIn }, info) => {
  void signedIn;
  await db.user.update({ where: { id: account.id }, data: { educationVerifiedAt: null } });
  const originalViewport = page.viewportSize()!;
  await page.setViewportSize({ width: 1280, height: 896 });
  const directIdentityRoutes = ['/dashboard/referrals', '/dashboard/vip', '/dashboard/coupons', '/dashboard', '/dashboard/match', '/dashboard/profile', '/dashboard/me'];
  const directIdentityEvidence = [];
  // Start with auxiliary pages in a fresh document, before any center seed.
  for (const route of directIdentityRoutes) {
    await visit(page, route);
    for (const load of ['direct', 'reload']) {
      if (load === 'reload') await page.reload({ waitUntil: 'domcontentloaded' });
      const menuAvatar = page.getByRole('button', { name: `账号菜单：${account.displayName}`, exact: true });
      await expect(menuAvatar).toBeVisible();
      await expect(menuAvatar).toHaveText(Array.from(account.displayName)[0].toUpperCase());
      await menuAvatar.click();
      const accountMenu = page.getByRole('menu');
      await expect(accountMenu.getByRole('menuitem')).toHaveText(['返回首页', '修改密码', '注销账号', '退出登录']);
      await accountMenu.getByRole('menuitem', { name: '注销账号', exact: true }).click();
      const deletion = page.getByRole('dialog', { name: '注销账号', exact: true });
      await expect(deletion).toBeVisible();
      await deletion.getByRole('button', { name: '暂不注销，返回', exact: true }).click();
      await expect(deletion).not.toBeVisible();
      await expect(menuAvatar).toBeFocused();
      directIdentityEvidence.push({ route, load, viewportWidth: 1280, accountNamePresent: true, avatarInitialCorrect: true, deletionOpened: true, focusRestored: true });
    }
  }
  await page.setViewportSize(originalViewport);
  await visit(page, '/dashboard/me');
  const education = page.getByRole('region', { name: '教育认证', exact: true });
  const trigger = education.getByRole('button', { name: '去认证', exact: true });
  await expect(trigger).toBeVisible();
  const dimensions = [];
  for (const width of [320, 375, 550, 747, 879, 880, 1104, 1280]) {
    await page.setViewportSize({ width, height: 896 });
    const rows = [education, page.getByRole('link', { name: '我的邀请', exact: true }), page.getByRole('link', { name: '我的优惠券', exact: true })];
    const heights = await Promise.all(rows.map(row => row.evaluate(element => element.getBoundingClientRect().height)));
    expect(heights[1]).toBe(93);
    expect(heights[2]).toBe(93);
    expect(heights[0]).toBeGreaterThanOrEqual(120);
    const cards = await Promise.all(rows.slice(1).map(row => row.boundingBox()));
    expect(Math.abs(cards[0]!.y - cards[1]!.y)).toBeLessThan(1);
    await expect(page.getByRole('heading', { name: '账号设置', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '修改密码', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const vip = await page.getByRole('region', { name: 'LiLink VIP', exact: true }).boundingBox();
    const identity = await page.getByRole('region', { name: '账号信息', exact: true }).boundingBox();
    if (width >= 880) expect(Math.abs(vip!.y - identity!.y)).toBeLessThan(1);
    else expect(vip!.y).toBeGreaterThan(identity!.y);
    dimensions.push({ width, heights, noOverflow: true });
    if ([375, 1280].includes(width)) await page.screenshot({ path: info.outputPath(`center-${width}.png`), fullPage: true });
  }
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '选择认证方式', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: /使用邀请码认证/ })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /认证教育邮箱/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole('button', { name: /使用邀请码认证/ }).click();
  await expect(page.getByRole('dialog').getByLabel('邀请码', { exact: true })).toBeVisible();
  const schoolSelect = page.getByRole('dialog').getByRole('combobox', { name: /^认证学校/ });
  await expect(schoolSelect).toBeEnabled();
  await schoolSelect.selectOption({ index: 1 });
  await expect(schoolSelect).not.toHaveValue('');
  await page.screenshot({ path: info.outputPath('education-school-select.png') });
  await page.getByRole('button', { name: '← 更换认证方式', exact: true }).click();
  await dialog.getByRole('button', { name: /认证教育邮箱/ }).click();
  await expect(page.getByRole('dialog').getByRole('textbox', { name: /^教育邮箱/ })).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: '发送验证码', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('education-email-code.png') });
  await page.getByRole('button', { name: '关闭教育认证', exact: true }).click();
  await expect(trigger).toBeFocused();
  const avatar = page.getByRole('button', { name: /账号菜单/ });
  await avatar.click();
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem')).toHaveText(['返回首页', '修改密码', '注销账号', '退出登录']);
  await expect(menu.getByRole('menuitem', { name: '修改密码', exact: true })).toHaveAttribute('href', '/forgot-password');
  await menu.getByRole('menuitem', { name: '注销账号', exact: true }).click();
  await expect(menu).not.toBeVisible();
  await expect(page.getByRole('dialog', { name: '注销账号', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '暂不注销，返回', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '注销账号', exact: true })).not.toBeVisible();
  await expect(avatar).toBeFocused();
  await avatar.click();
  await menu.getByRole('menuitem', { name: '注销账号', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(avatar).toBeFocused();
  await avatar.click();
  await menu.getByRole('menuitem', { name: '修改密码', exact: true }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await info.attach('layout-assertions', { contentType: 'application/json', body: JSON.stringify({ dimensions, dialogs: true, focusRestored: true, deletionNotSubmitted: true, sharedMenuRoutes: directIdentityRoutes.length, directIdentityEvidence }) });
});

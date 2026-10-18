import { randomUUID } from 'node:crypto';
import { test, expect, api, password, visit, login, mailCode, completeProfile } from '../support/fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// A lost write response is not proof of failure. Bound modal lock time, allow
// delivered codes, and reconcile committed upgrades before offering a retry.
test('stalled education code delivery releases the dialog and accepts delivered mail @mobile @webkit', async ({ page, db, account, signedIn }, info) => {
  void signedIn;
  await db.user.update({ where: { id: account.id }, data: { educationVerifiedAt: null } });
  await visit(page, '/dashboard/me');
  await page.clock.install();
  await page.getByRole('button', { name: '去认证', exact: true }).click();
  await page.getByRole('button', { name: /认证教育邮箱/ }).click();
  const dialog = page.getByRole('dialog', { name: '认证教育邮箱', exact: true });
  const email = `${randomUUID()}@school.example.test`;
  await page.getByRole('textbox', { name: /^教育邮箱/ }).fill(email);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let delivered = false;
  await page.route(`${api}/me/education/email/request-code`, async route => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    delivered = true;
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole('button', { name: '发送验证码', exact: true }).click();
    await expect.poll(() => delivered).toBe(true);
    await expect(page.getByRole('button', { name: '关闭教育认证' })).toBeDisabled();
    await page.clock.fastForward(15_100);
    await expect(dialog.getByRole('alert')).toContainText('验证码发送结果待确认');
    await expect(page.getByRole('button', { name: '关闭教育认证' })).toBeEnabled();
    await page.getByLabel('认证验证码', { exact: true }).fill(await mailCode(page, email));
    await page.getByRole('button', { name: '完成教育邮箱认证', exact: true }).click();
    await expect(page.getByRole('region', { name: '账号信息', exact: true }).getByText('教育用户', { exact: true })).toBeVisible();
    expect((await db.user.findUniqueOrThrow({ where: { id: account.id } })).educationEmail).toBe(email);
    await info.attach('education-code-timeout', { contentType: 'application/json', body: JSON.stringify({ boundedWait: true, dialogUnlocked: true, deliveredCodeAccepted: true, browserProject: info.project.name }) });
  } finally { release(); }
});

test('stalled committed education invitation reconciles without a second debit @mobile @webkit', async ({ page, db, account, signedIn }, info) => {
  void signedIn;
  const source = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const referralCode = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
  const inviter = await db.user.create({ data: { email: `${randomUUID()}@school.example.test`, passwordHash: source.passwordHash, status: 'ACTIVE', referralCode, educationVerifiedAt: new Date(), educationVerificationMethod: 'LEGACY', nonEduReferralLimit: 1 } });
  await visit(page, '/dashboard/me');
  await page.clock.install();
  await page.getByRole('button', { name: '去认证', exact: true }).click();
  await page.getByRole('button', { name: /使用邀请码认证/ }).click();
  await page.getByLabel('邀请码', { exact: true }).fill(referralCode);
  await page.getByRole('combobox', { name: /^认证学校/ }).selectOption(source.schoolId!);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let committed = false;
  let writes = 0;
  await page.route(`${api}/me/education/invite`, async route => {
    writes++;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    committed = true;
    await gate;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole('button', { name: '确认邀请码认证', exact: true }).click();
    await expect.poll(() => committed).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.clock.fastForward(15_100);
    await expect(page.getByRole('region', { name: '账号信息', exact: true }).getByText('教育用户', { exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    expect(writes).toBe(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: inviter.id } })).nonEduReferralUses).toBe(1);
    await info.attach('education-write-reconciliation', { contentType: 'application/json', body: JSON.stringify({ committedResponseLost: true, authoritativeReadRestoredIdentity: true, writes, debits: 1, browserProject: info.project.name }) });
  } finally { release(); }
});

test('uncertain education invitation waits for a successful status read before retry @mobile @webkit', async ({ page, account, signedIn }, info) => {
  void signedIn;
  await visit(page, '/dashboard/me');
  await page.clock.install();
  await page.getByRole('button', { name: '去认证', exact: true }).click();
  await page.getByRole('button', { name: /使用邀请码认证/ }).click();
  const dialog = page.getByRole('dialog', { name: '使用邀请码认证', exact: true });
  await page.getByLabel('邀请码', { exact: true }).fill('SYNTHETIC1');
  await page.getByRole('combobox', { name: /^认证学校/ }).selectOption({ index: 1 });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let writes = 0;
  let readFails = true;
  await page.route(`${api}/me/education/invite`, async route => { writes++; await gate; await route.abort(); });
  await page.route(`${api}/me/education`, route => readFails ? route.fulfill({ status: 503, json: { message: 'Synthetic unavailable' } }) : route.continue());
  try {
    await page.getByRole('button', { name: '确认邀请码认证', exact: true }).click();
    await expect.poll(() => writes).toBe(1);
    await page.clock.fastForward(15_100);
    await expect(dialog.getByRole('alert')).toContainText('认证结果待确认');
    await expect(page.getByRole('button', { name: '确认邀请码认证', exact: true })).toBeDisabled();
    const confirm = page.getByRole('button', { name: '重新确认认证结果', exact: true });
    await expect(confirm).toBeEnabled();
    await expect(page.getByRole('button', { name: '关闭教育认证' })).toBeEnabled();
    readFails = false;
    await confirm.click();
    await expect(page.getByRole('button', { name: '确认邀请码认证', exact: true })).toBeEnabled();
    await expect(dialog.getByRole('alert')).toContainText('可重新提交');
    expect(writes).toBe(1);
    await page.getByRole('button', { name: '关闭教育认证' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await info.attach('education-uncertain-result', { contentType: 'application/json', body: JSON.stringify({ accountIdPresent: Boolean(account.id), noAutomaticWriteRetry: true, retryRequiresAuthoritativeRead: true, dialogRecovered: true, browserProject: info.project.name }) });
  } finally { release(); }
});

// Failure boundaries: registration must not require an invite/school; claiming
// a school must not verify it; upgrades must preserve login and isolate codes.
test('ordinary registration can join matching and redeem education invitation @mobile @webkit', async ({ page, context, db, account }, info) => {
  const email = `${randomUUID()}@personal.example.test`;
  const referralCode = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
  const school = await db.school.findUniqueOrThrow({ where: { slug: 'e2e-school' } });
  await db.user.update({ where: { id: account.id }, data: { referralCode, educationVerifiedAt: new Date(), educationVerificationMethod: 'LEGACY', nonEduReferralLimit: 1 } });
  await visit(page, '/register/personal');
  await expect(page.getByLabel('邀请码', { exact: true })).toHaveCount(0);
  await page.getByLabel('普通邮箱', { exact: true }).fill(email);
  await expect(page.getByLabel('普通邮箱', { exact: true })).toHaveValue(email);
  await page.getByRole('button', { name: '发送验证码', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '验证码已发送' })).toBeVisible();
  await expect(page.getByLabel('普通邮箱', { exact: true })).toHaveValue(email);
  await page.getByLabel('验证码', { exact: true }).fill(await mailCode(page, email));
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByLabel('确认密码', { exact: true }).fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const created = await db.user.findUniqueOrThrow({ where: { email } });
  expect(created.schoolId).toBeNull();
  expect(created.educationVerifiedAt).toBeNull();
  await completeProfile(context, db);
  await visit(page, '/dashboard');
  await page.getByRole('button', { name: '选择意向并报名', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /两者|都可以/ }).click();
  await expect(page.getByRole('main').getByText('报名成功', { exact: true })).toBeVisible();
  await visit(page, '/dashboard/me');
  const section = page.getByRole('region', { name: '教育认证', exact: true });
  const identity = page.getByRole('region', { name: '账号信息', exact: true });
  await expect(identity.getByText('非教育用户', { exact: true })).toBeVisible();
  await expect(section.getByText('非教育用户', { exact: true })).toHaveCount(0);
  await section.getByRole('button', { name: '去认证', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /使用邀请码认证/ }).click();
  await section.getByRole('combobox', { name: /^认证学校/ }).selectOption(school.id);
  await section.getByLabel('邀请码', { exact: true }).fill('INVALID123');
  await section.getByRole('button', { name: '确认邀请码认证', exact: true }).click();
  await expect(section.getByRole('alert')).toContainText('邀请码');
  await section.getByLabel('邀请码', { exact: true }).fill(referralCode);
  await section.getByRole('button', { name: '确认邀请码认证', exact: true }).click();
  await expect(identity.getByText('教育用户', { exact: true })).toBeVisible();
  await expect(section.getByRole('button', { name: '使用邀请码认证', exact: true })).toHaveCount(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(identity.getByText('教育用户', { exact: true })).toBeVisible();
  expect((await db.user.findUniqueOrThrow({ where: { id: created.id } })).email).toBe(email);
  expect((await db.user.findUniqueOrThrow({ where: { id: account.id } })).nonEduReferralUses).toBe(1);
  expect((await context.request.post(`${api}/me/education/invite`, { data: { referralCode, schoolId: school.id } })).ok()).toBe(true);
  expect((await db.user.findUniqueOrThrow({ where: { id: account.id } })).nonEduReferralUses).toBe(1);
  await info.attach('education-invite-assertions', { contentType: 'application/json', body: JSON.stringify({ project: info.project.name, assertions: { registrationWithoutInviteOrSchool: true, ordinaryCanOptIn: true, invalidInviteVisible: true, upgradePersisted: true, loginPreserved: true, repeatDoesNotSpendQuota: true } }) });
  await page.screenshot({ path: info.outputPath('education-invite-complete.png'), fullPage: true });
});

test('education email upgrade verifies possession and keeps original login @mobile @webkit', async ({ page, context, db, account, browser }, info) => {
  const email = `${randomUUID()}@school.example.test`;
  await db.user.update({ where: { id: account.id }, data: { educationVerifiedAt: null, schoolId: null } });
  await login(page, account);
  await visit(page, '/dashboard/me');
  const section = page.getByRole('region', { name: '教育认证', exact: true });
  await section.getByRole('button', { name: '去认证', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /认证教育邮箱/ }).click();
  await section.getByRole('textbox', { name: /^教育邮箱/ }).fill(`${randomUUID()}@personal.example.test`);
  await section.getByRole('button', { name: '发送验证码', exact: true }).click();
  await expect(section.getByRole('alert')).toContainText('学校邮箱');
  await section.getByRole('textbox', { name: /^教育邮箱/ }).fill(email);
  await section.getByRole('button', { name: '发送验证码', exact: true }).click();
  await expect(section.getByRole('status')).toContainText('验证码已发送');
  const code = await mailCode(page, email);
  const other = await db.user.create({ data: { email: `${randomUUID()}@personal.example.test`, passwordHash: (await db.user.findUniqueOrThrow({ where: { id: account.id } })).passwordHash, status: 'ACTIVE' } });
  const otherContext = await browser.newContext({ extraHTTPHeaders: { 'cf-connecting-ip': '2001:db8:145::1' } });
  try {
    expect((await otherContext.request.post(`${api}/auth/login`, { data: { email: other.email, password } })).ok()).toBe(true);
    expect((await otherContext.request.post(`${api}/me/education/email/verify`, { data: { email, code } })).status()).toBe(400);
  } finally { await otherContext.close(); }
  await section.getByLabel('认证验证码', { exact: true }).fill(code === '000000' ? '111111' : '000000');
  await section.getByRole('button', { name: '完成教育邮箱认证', exact: true }).click();
  await expect(section.getByRole('alert')).toContainText('验证码');
  await section.getByLabel('认证验证码', { exact: true }).fill(code);
  await section.getByRole('button', { name: '完成教育邮箱认证', exact: true }).click();
  await expect(page.getByRole('region', { name: '账号信息', exact: true }).getByText('教育用户', { exact: true })).toBeVisible();
  const persisted = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  expect(persisted.email).toBe(account.email);
  expect(persisted.educationEmail).toBe(email);
  expect(persisted.schoolId).not.toBeNull();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('region', { name: '账号信息', exact: true }).getByText('教育用户', { exact: true })).toBeVisible();
  await info.attach('education-mail-assertions', { contentType: 'application/json', body: JSON.stringify({ project: info.project.name, assertions: { ordinaryEmailRejected: true, crossAccountReplayRejected: true, wrongCodeRejected: true, verifiedMailboxPersisted: true, loginUnchanged: true } }) });
  await page.screenshot({ path: info.outputPath('education-mail-complete.png'), fullPage: true });
});

test('last invitation slot admits exactly one upgrade and ordinary inviters cannot verify others', async ({ context, browser, db, account }) => {
  const source = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const school = await db.school.findUniqueOrThrow({ where: { slug: 'e2e-school' } });
  const referralCode = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
  await db.user.update({ where: { id: account.id }, data: { referralCode, educationVerifiedAt: new Date(), educationVerificationMethod: 'LEGACY', nonEduReferralLimit: 1 } });
  const contexts = await Promise.all([0, 1].map(() => browser.newContext()));
  try {
    for (const entry of contexts) {
      const email = `${randomUUID()}@personal.example.test`;
      await db.user.create({ data: { email, passwordHash: source.passwordHash, status: 'ACTIVE' } });
      expect((await entry.request.post(`${api}/auth/login`, { data: { email, password } })).ok()).toBe(true);
    }
    const results = await Promise.all(contexts.map(entry => entry.request.post(`${api}/me/education/invite`, { data: { referralCode, schoolId: school.id } })));
    expect(results.map(r => r.status()).sort()).toEqual([201, 400]);
    expect((await db.user.findUniqueOrThrow({ where: { id: account.id } })).nonEduReferralUses).toBe(1);
    await db.user.update({ where: { id: account.id }, data: { educationVerifiedAt: null, nonEduReferralLimit: 10 } });
    const loser = contexts[results.findIndex(r => !r.ok())];
    expect((await loser.request.post(`${api}/me/education/invite`, { data: { referralCode, schoolId: school.id } })).status()).toBe(400);
  } finally { await Promise.all(contexts.map(entry => entry.close())); }
});

test('four identities and ordinary-user warnings appear in current results and history @mobile @webkit', async ({ page, db, account, signedIn, isMobile }, info) => {
  void signedIn;
  const source = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const peer = await db.user.create({ data: { email: `${randomUUID()}@personal.example.test`, passwordHash: source.passwordHash, displayName: '身份验收对象', status: 'ACTIVE' } });
  const cycle = await db.matchCycle.create({ data: {
    codename: '身份标志验收', status: 'REVEALED', participationDeadline: new Date(Date.now() - 120_000), revealAt: new Date(Date.now() - 60_000),
    participations: { create: [account.id, peer.id].map(userId => ({ userId, status: 'OPTED_IN', intent: 'BOTH' })) },
  } });
  const match = await db.match.create({ data: {
    cycleId: cycle.id, score: 90, introducedAt: new Date(), revealedAt: new Date(),
    participants: { create: [account.id, peer.id].map((userId, index) => ({ userId, cycleId: cycle.id, position: index + 1, introducedContactType: 'WECHAT', introducedContactValue: 'synthetic-contact' })) },
  } });
  const warning = '这个人尚未通过教育认证，可能非学生，请谨慎对待。';
  const states = [[true, false, '非教育用户'], [true, true, '教育用户'], [false, true, '教育用户'], [false, false, '非教育用户']] as const;
  try {
    for (const [vipActive, educationVerified, label] of states) {
      await db.matchParticipant.updateMany({ where: { matchId: match.id, userId: peer.id }, data: { profileSnapshot: { introLine: '喜欢散步和读书。', gender: '女', partnerGenders: ['男', '女'], vipActive, educationVerified } } });
      await db.userCycleDashboardSnapshot.deleteMany({ where: { cycleId: cycle.id } });
      await visit(page, '/dashboard/match');
      await page.getByRole('button', { name: '查看上一轮结果 →', exact: true }).click();
      const letter = page.locator('article').filter({ has: page.getByRole('heading', { name: '身份验收对象', exact: true, level: 2 }) });
      await expect(letter.getByText(label, { exact: true })).toBeVisible();
      await expect(letter.getByLabel('VIP 会员', { exact: true })).toHaveCount(vipActive ? 1 : 0);
      await expect(letter.getByText(/VIP教育用户|VIP普通用户|普通用户/)).toHaveCount(0);
      await expect(letter.getByText(warning, { exact: true })).toHaveCount(educationVerified ? 0 : 1);
      for (const width of isMobile ? [320, 390] : [375, 879, 880, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await page.screenshot({ path: info.outputPath(`identity-${vipActive}-${educationVerified}.png`), fullPage: true });
      await visit(page, '/dashboard/match/history');
      const history = page.getByRole('region', { name: '过往匹配', exact: true });
      await expect(history.getByText(label, { exact: true })).toBeVisible();
      await expect(history.getByLabel('VIP 会员', { exact: true })).toHaveCount(vipActive ? 1 : 0);
      await expect(history.getByText(warning, { exact: true })).toHaveCount(educationVerified ? 0 : 1);
    }
    await db.report.create({ data: { matchId: match.id, reporterId: account.id, reportedUserId: peer.id, reason: 'SYNTHETIC', details: 'Synthetic privacy boundary' } });
    await db.userCycleDashboardSnapshot.deleteMany({ where: { cycleId: cycle.id } });
    await visit(page, '/dashboard/match');
    await expect(page.getByRole('heading', { name: '上一轮匹配已受限', exact: true })).toBeVisible();
    await expect(page.getByLabel('对方身份', { exact: true })).toHaveCount(0);
    await info.attach('identity-matrix', { contentType: 'application/json', body: JSON.stringify({ project: info.project.name, states: states.map(s => s[2]), assertions: { resultsAndHistory: true, warningsForBothOrdinaryTypes: true, noWarningForEducationTypes: true, restrictedIdentityHidden: true, noHorizontalOverflow: true } }) });
  } finally { await db.matchCycle.delete({ where: { id: cycle.id } }); }
});

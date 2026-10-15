import type { BrowserContext } from '@playwright/test';
import { COUPON_CODE_LENGTH, generateHumanCode, generateTotpSecret, generateTotpToken } from '@lilink/shared';
import { test, expect, api, password, visit, completeProfile } from '../support/fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// Establish publishing, report review and test-data isolation before splitting
// the admin services. Final UI, persistence, public cache and audit are checked.
test('admin publishes a questionnaire revision and reviews a report @smoke', async ({ page, db, account, context }, info) => {
  const source = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `operations-${account.email}`, passwordHash: source.passwordHash } });
  expect((await context.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBe(true);
  const original = await db.questionnaireVersion.findFirstOrThrow({ where: { isCurrent: true }, include: { questions: { orderBy: { order: 'asc' } } } });
  const question = original.questions[0];
  const publicBaseline = await (await context.request.get(`${api}/questionnaire/current`)).json();
  const originalOptions = publicBaseline.questions.find((q: any) => q.key === question.key).options;
  const prompt = `合成发布验收 ${account.id}`;
  const peer = await db.user.create({ data: { email: `reported-${account.email}`, passwordHash: source.passwordHash, status: 'ACTIVE' } });
  const report = await db.report.create({ data: { reporterId: account.id, reportedUserId: peer.id, reason: `合成举报 ${account.id}` } });
  try {
    await context.request.get(`${api}/questionnaire/current`);
    await visit(page, '/admin/questionnaire');
    await page.getByText(question.prompt, { exact: true }).click();
    await page.getByRole('textbox', { name: '题目内容', exact: true }).fill(prompt);
    const published = page.waitForResponse(response => response.url() === `${api}/admin/questionnaire/questions` && response.request().method() === 'PUT');
    await page.getByRole('button', { name: '保存修改', exact: true }).click();
    const publication = await published;
    expect(publication.ok(), await publication.text()).toBe(true);
    await expect(page.getByText(prompt, { exact: true })).toBeVisible();
    const current = await db.questionnaireVersion.findFirstOrThrow({ where: { isCurrent: true }, include: { questions: true } });
    expect(current.id).not.toBe(original.id);
    expect(current.questions.find((q: any) => q.key === question.key)?.prompt).toBe(prompt);
    const publicResponse = await context.request.get(`${api}/questionnaire/current`);
    expect((await publicResponse.json()).questions.find((q: any) => q.key === question.key)?.prompt).toBe(prompt);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(prompt, { exact: true })).toBeVisible();
    await visit(page, '/admin/reports');
    await page.getByRole('button', { name: new RegExp(report.reason) }).click();
    await page.getByRole('textbox', { name: '处理备注', exact: true }).fill('合成处置验收');
    await page.getByRole('button', { name: '处理完成', exact: true }).click();
    await expect.poll(async () => (await db.report.findUniqueOrThrow({ where: { id: report.id } })).status).toBe('RESOLVED');
    expect((await db.report.findUniqueOrThrow({ where: { id: report.id } })).adminNotes).toBe('合成处置验收');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '已结案', exact: true }).click();
    await expect(page.getByRole('button', { name: new RegExp(report.reason) })).toBeVisible();
    expect(await db.auditLog.count({ where: { adminActorId: admin.id, action: { in: ['question.updated', 'report.reviewed'] } } })).toBe(2);
    await info.attach('admin-operations-contract', { contentType: 'application/json', body: JSON.stringify({
      assertions: { newQuestionnaireRevision: true, publicCacheUpdated: true, publishedPageReloads: true,
        reportResolved: true, reviewNotesPersist: true, finalReportVisible: true, auditEvents: 2 },
    }) });

  } finally {
    const current = await db.questionnaireVersion.findFirstOrThrow({ where: { isCurrent: true }, include: { questions: true } });
    const activeQuestion = current.questions.find((q: any) => q.key === question.key);
    const restored = await context.request.put(`${api}/admin/questionnaire/questions`, { data: {
      questionId: activeQuestion.id, key: question.key, prompt: question.prompt, type: question.type,
      options: originalOptions, order: question.order, weight: question.weight,
      ...(question.selectionLimit === null ? {} : { selectionLimit: question.selectionLimit }),
    } });
    expect(restored.ok(), await restored.text()).toBe(true);
  }
});

test('bulk test-user removal leaves ordinary users intact and admin routes reject other identities @smoke', async ({ page, db, account, context, browser }, info) => {
  const source = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `cleanup-${account.email}`, passwordHash: source.passwordHash } });
  expect((await context.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBe(true);
  const synthetic = await db.user.create({ data: { email: `cleanup-test-${account.email}`, passwordHash: source.passwordHash, isTest: true, status: 'ACTIVE' } });
  // Cleanup must handle the new Restrict relations while preserving ordinary holders.
  const merchant = await db.merchant.create({ data: { name: '合成验收商家' } });
  const operator = await db.merchantUser.create({ data: { email: `merchant-${account.email}`, passwordHash: source.passwordHash, merchantId: merchant.id, role: 'OWNER' } });
  const campaign = await db.campaign.create({ data: { name: '合成清理活动', slug: `cleanup-${account.id}` } });
  const group = await db.couponRedemptionGroup.create({ data: { campaignId: campaign.id, merchantId: merchant.id, name: '合成清理组' } });
  const template = await db.couponTemplate.create({ data: { campaignId: campaign.id, merchantId: merchant.id, redemptionGroupId: group.id, title: '清理验收券', benefitText: '合成优惠' } });
  const issue = (userId: string) => db.coupon.create({ data: { userId, templateId: template.id, code: generateHumanCode({ length: COUPON_CODE_LENGTH }), totpSecret: generateTotpSecret() } });
  const testCoupon = await issue(synthetic.id);
  const ordinaryCoupon = await issue(account.id);
  expect((await context.request.post(`${api}/merchant/auth/login`, { data: { email: operator.email, password } })).ok()).toBe(true);
  expect((await (await context.request.post(`${api}/merchant/redeem`, { data: { code: testCoupon.code, totp: generateTotpToken(testCoupon.totpSecret) } })).json()).result).toBe('SUCCESS');
  await visit(page, '/admin/users');
  await page.getByRole('combobox', { name: '账号类型', exact: true }).selectOption('test');
  await expect(page.getByText(synthetic.email, { exact: true })).toBeVisible();
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '删除全部测试用户', exact: true }).click();
  await expect(page.getByText('没有找到匹配的用户。', { exact: true })).toBeVisible();
  expect(await db.user.count({ where: { id: synthetic.id } })).toBe(0);
  expect(await db.user.count({ where: { id: account.id } })).toBe(1);
  expect(await db.couponGroupRedemption.count({ where: { userId: synthetic.id } })).toBe(0);
  expect(await db.redemption.count({ where: { userId: synthetic.id } })).toBe(0);
  expect((await db.coupon.findUniqueOrThrow({ where: { id: ordinaryCoupon.id } })).status).toBe('ISSUED');
  expect(await db.couponRedemptionGroup.count({ where: { id: group.id } })).toBe(1);
  const ordinary = await browser.newContext();
  try {
    for (const authenticated of [false, true]) {
      if (authenticated) expect((await ordinary.request.post(`${api}/auth/login`, { data: { email: account.email, password } })).ok()).toBe(true);
      for (const route of ['/admin/users', '/admin/reports', '/admin/questionnaire', '/admin/cycles']) {
        expect((await ordinary.request.get(`${api}${route}`)).status()).toBe(401);
      }
    }
    await ordinary.clearCookies();
    expect((await ordinary.request.post(`${api}/merchant/auth/login`, { data: { email: operator.email, password } })).ok()).toBe(true);
    for (const route of ['/admin/users', '/admin/reports', '/admin/questionnaire', '/admin/cycles']) {
      expect((await ordinary.request.get(`${api}${route}`)).status()).toBe(401);
    }
  } finally { await ordinary.close(); }
  expect(await db.auditLog.count({ where: { adminActorId: admin.id, action: 'users.test_deleted' } })).toBe(1);
  await info.attach('admin-test-data-contract', { contentType: 'application/json', body: JSON.stringify({
    assertions: { syntheticRemoved: true, ordinaryPreserved: true, groupedRedemptionRemoved: true, ordinaryCouponAndGroupPreserved: true, unauthenticatedUserAndMerchantDenied: true, auditWritten: true },
  }) });
});

test('admin closes registration and user sees the updated state', async ({ page, signedIn, account, context, db }) => {
  void signedIn;
  await completeProfile(context, db);
  const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `admin-${account.email}`, passwordHash: user.passwordHash, displayName: '自动化管理员' } });
  const cycle = await db.matchCycle.findFirstOrThrow({ where: { status: 'OPEN' } });
  try {
    const landingBefore = await context.request.get(`${api}/public/landing`);
    expect((await landingBefore.json()).currentCycle?.codename).toBe(cycle.codename);
    await visit(page, '/admin');
    await page.getByLabel('管理员邮箱', { exact: true }).fill(admin.email);
    await page.getByLabel('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: '进入后台', exact: true }).click();
    await expect.poll(async () => (await context.request.get(`${api}/admin-session/me`)).status()).toBe(200);
    await visit(page, '/admin/cycles');
    await page.getByRole('button', { name: '编辑轮次', exact: true }).click();
    await page.getByRole('combobox', { name: '状态', exact: true }).selectOption('DRAFT');
    await page.getByRole('button', { name: '保存轮次', exact: true }).click();
    await expect.poll(async () => (await db.matchCycle.findUniqueOrThrow({ where: { id: cycle.id } })).status).toBe('DRAFT');
    const landingAfter = await context.request.get(`${api}/public/landing`);
    expect((await landingAfter.json()).currentCycle).toBeNull();
    await visit(page, '/dashboard');
    await expect(page.getByRole('region').getByText('报名未开放', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '选择意向并报名', exact: true })).toHaveCount(0);
  } finally {
    if ((await db.matchCycle.findUniqueOrThrow({ where: { id: cycle.id } })).status !== cycle.status) {
      const restored = await context.request.put(`${api}/admin/cycles`, { data: {
        cycleId: cycle.id, codename: cycle.codename, status: cycle.status,
        participationDeadline: cycle.participationDeadline.toISOString(), revealAt: cycle.revealAt.toISOString(),
      } });
      expect(restored.ok()).toBe(true);
      expect((await (await context.request.get(`${api}/public/landing`)).json()).currentCycle?.codename).toBe(cycle.codename);
    }
  }
});

async function loginAdmin(context: BrowserContext, db: any, accountId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: accountId } });
  const admin = await db.adminOperator.create({ data: { email: `weekly-admin-${user.email}`, passwordHash: user.passwordHash } });
  const response = await context.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } });
  expect(response.ok(), await response.text()).toBeTruthy();
}

test('cycle management keeps automation server-side @smoke @webkit @mobile', async ({ page, context, db, account }, info) => {
  await loginAdmin(context, db, account.id);
  const before = await db.systemSetting.findUnique({ where: { key: 'weekly-cycle-schedule' } });
  const settingsRequests: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/weekly-cycle-settings')) settingsRequests.push(request.method());
  });
  await visit(page, '/admin/cycles');
  await expect(page.getByRole('heading', { name: '轮次管理', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '新建轮次', exact: true })).toBeVisible();
  await expect(page.getByText('每周自动续轮', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: '启用自动续轮' })).toHaveCount(0);
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.getByRole('heading', { name: '轮次管理', exact: true })).toBeVisible();
  expect(settingsRequests).toEqual([]);
  expect(await db.systemSetting.findUnique({ where: { key: 'weekly-cycle-schedule' } })).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('cycles-server-default.png'), fullPage: true });
});

test('@smoke admin cancels then deletes an empty draft with final list and audit proof', async ({ page, context, db, account }, info) => {
  await loginAdmin(context, db, account.id);
  const name = `空白草稿-${account.id}`;
  const cycle = await db.matchCycle.create({ data: { codename: name, status: 'DRAFT', participationDeadline: new Date('2035-01-01'), revealAt: new Date('2035-01-02') } });
  await visit(page, '/admin/cycles');
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await page.getByRole('button', { name: '删除草稿', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '删除草稿轮次' });
  await expect(dialog).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });

  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(await db.matchCycle.findUnique({ where: { id: cycle.id } })).not.toBeNull();
  await page.getByRole('button', { name: '删除草稿', exact: true }).click();
  await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(name) })).toHaveCount(0);
  expect(await db.matchCycle.findUnique({ where: { id: cycle.id } })).toBeNull();
  expect(await db.auditLog.count({ where: { action: 'cycle.deleted', metadata: { path: ['cycleId'], equals: cycle.id } } })).toBe(1);
});

test('admin confirms participation deletion while active and matched cycles remain protected', async ({ page, context, db, account }, info) => {
  await loginAdmin(context, db, account.id);
  const active = await db.matchCycle.findFirstOrThrow({ where: { status: 'OPEN' } });
  expect((await context.request.delete(`${api}/admin/cycles/${active.id}`)).status()).toBe(409);
  const cycle = await db.matchCycle.create({ data: { codename: `已有参与-${account.id}`, status: 'DRAFT', participationDeadline: new Date('2035-01-01'), revealAt: new Date('2035-01-02'), participations: { create: { userId: account.id, status: 'OPTED_OUT' } } } });
  await visit(page, '/admin/cycles');
  await page.getByRole('button', { name: new RegExp(cycle.codename) }).click();
  expect((await context.request.delete(`${api}/admin/cycles/${cycle.id}`)).status()).toBe(409);
  expect(await db.matchCycle.findUnique({ where: { id: cycle.id } })).not.toBeNull();
  await page.getByRole('button', { name: '删除草稿', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '删除草稿轮次' });
  await expect(dialog).toContainText('1 条参与记录');
  await page.setViewportSize({ width: 390, height: 844 });

  await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(cycle.codename) })).toHaveCount(0);
  expect(await db.cycleParticipation.count({ where: { cycleId: cycle.id } })).toBe(0);
  expect(await db.user.findUnique({ where: { id: account.id } })).not.toBeNull();
  const matched = await db.matchCycle.create({ data: { codename: `已有匹配-${account.id}`, status: 'DRAFT', participationDeadline: new Date('2035-01-01'), revealAt: new Date('2035-01-02'), matches: { create: { score: 0 } } } });
  await page.reload();
  await page.getByRole('button', { name: new RegExp(matched.codename) }).click();
  await expect(page.getByRole('button', { name: '删除草稿', exact: true })).toBeDisabled();
  expect((await context.request.delete(`${api}/admin/cycles/${matched.id}`)).status()).toBe(409);
  expect(await db.matchCycle.findUnique({ where: { id: matched.id } })).not.toBeNull();
  await db.matchCycle.delete({ where: { id: matched.id } });
});

test('ordinary users cannot change the cycle schedule or delete cycles', async ({ context, signedIn }) => {
  void signedIn;
  expect((await context.request.get(`${api}/admin/weekly-cycle-settings`)).status()).toBe(401);
  expect((await context.request.put(`${api}/admin/weekly-cycle-settings`, { data: { enabled: true, deadlineHours: 2 } })).status()).toBe(401);
  expect((await context.request.delete(`${api}/admin/cycles/unused`)).status()).toBe(401);
});

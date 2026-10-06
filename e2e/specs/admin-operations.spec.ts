import { test, expect, api, password, visit } from '../support/fixtures';

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
    await info.attach('admin-report-resolved', { contentType: 'image/png', body: await page.screenshot({ animations: 'disabled' }) });
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
  await visit(page, '/admin/users');
  await page.getByRole('combobox', { name: '账号类型', exact: true }).selectOption('test');
  await expect(page.getByText(synthetic.email, { exact: true })).toBeVisible();
  page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '删除全部测试用户', exact: true }).click();
  await expect(page.getByText('没有找到匹配的用户。', { exact: true })).toBeVisible();
  expect(await db.user.count({ where: { id: synthetic.id } })).toBe(0);
  expect(await db.user.count({ where: { id: account.id } })).toBe(1);
  const ordinary = await browser.newContext();
  try {
    for (const authenticated of [false, true]) {
      if (authenticated) expect((await ordinary.request.post(`${api}/auth/login`, { data: { email: account.email, password } })).ok()).toBe(true);
      for (const route of ['/admin/users', '/admin/reports', '/admin/questionnaire', '/admin/cycles']) {
        expect((await ordinary.request.get(`${api}${route}`)).status()).toBe(401);
      }
    }
    const merchant = await db.merchant.create({ data: { name: '合成验收商家' } });
    const operator = await db.merchantUser.create({ data: { email: `merchant-${account.email}`, passwordHash: source.passwordHash, merchantId: merchant.id, role: 'OWNER' } });
    await ordinary.clearCookies();
    expect((await ordinary.request.post(`${api}/merchant/auth/login`, { data: { email: operator.email, password } })).ok()).toBe(true);
    for (const route of ['/admin/users', '/admin/reports', '/admin/questionnaire', '/admin/cycles']) {
      expect((await ordinary.request.get(`${api}${route}`)).status()).toBe(401);
    }
  } finally { await ordinary.close(); }
  expect(await db.auditLog.count({ where: { adminActorId: admin.id, action: 'users.test_deleted' } })).toBe(1);
  await info.attach('admin-test-data-contract', { contentType: 'application/json', body: JSON.stringify({
    assertions: { syntheticRemoved: true, ordinaryPreserved: true, unauthenticatedUserAndMerchantDenied: true, auditWritten: true },
  }) });
});

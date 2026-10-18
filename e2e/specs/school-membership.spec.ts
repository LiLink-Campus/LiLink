import { randomUUID } from 'node:crypto';
import type { Route } from '@playwright/test';
import { HARD_MATCH_KEYS, NO_SCHOOL_ID } from '@lilink/shared';
import { test, expect, api, password, visit, mailCode } from '../support/fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// School existence defines eligibility. Removal must reject pending new claims
// while preserving previously earned education identity and ordinary registration.
test('configured schools allow education and deletion preserves existing identity @webkit @mobile', async ({ page, context, browser, db, account, signedIn }, info) => {
  void signedIn;
  const source = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  await db.user.update({ where: { id: account.id }, data: { educationVerifiedAt: null } });
  const admin = await db.adminOperator.create({ data: { email: `school-admin-${account.email}`, passwordHash: source.passwordHash } });
  expect((await context.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBe(true);
  const slug = `configured-${randomUUID()}`;
  const domain = `${slug}.example.test`;
  const name = '合成认证大学';
  await visit(page, '/admin/schools');
  await page.getByRole('button', { name: /添加学校/ }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(0);
  await expect(page.getByText(/关闭后该校将/)).toHaveCount(0);
  await page.getByLabel('学校名称', { exact: true }).fill(name);
  await page.getByLabel('标识 (Slug)', { exact: true }).fill(slug);
  await page.getByLabel('邮箱域名（逗号分隔）', { exact: true }).fill(domain);
  await page.screenshot({ path: info.outputPath('school-editor.png'), fullPage: true });
  await page.getByRole('button', { name: '创建学校', exact: true }).click();
  await expect.poll(() => db.school.count({ where: { slug } })).toBe(1);
  const school = await db.school.findUniqueOrThrow({ where: { slug } });
  expect(school.registrationEligible).toBe(true);
  // Persisted legacy false values must not hide schools or block new claims.
  await db.school.update({ where: { id: school.id }, data: { registrationEligible: false } });
  const publicList = await (await context.request.get(`${api}/public/schools`)).json();
  expect(JSON.stringify(publicList)).toContain(school.id);
  const email = `verified@${domain}`;
  expect((await context.request.post(`${api}/me/education/email/request-code`, { data: { email } })).ok()).toBe(true);
  expect((await context.request.post(`${api}/me/education/email/verify`, { data: { email, code: await mailCode(page, email) } })).ok()).toBe(true);
  const verified = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  expect(verified.educationVerifiedAt).not.toBeNull();
  const other = await db.user.create({ data: { email: `pending-${account.email}`, passwordHash: source.passwordHash, status: 'ACTIVE' } });
  const otherContext = await browser.newContext();
  try {
    expect((await otherContext.request.post(`${api}/auth/login`, { data: { email: other.email, password } })).ok()).toBe(true);
    const pendingEmail = `pending@${domain}`;
    expect((await otherContext.request.post(`${api}/me/education/email/request-code`, { data: { email: pendingEmail } })).ok()).toBe(true);
    const pendingCode = await mailCode(page, pendingEmail);
    await page.getByRole('textbox', { name: '搜索学校', exact: true }).fill(slug);
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(page.getByText(name, { exact: true })).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await page.getByTitle('删除', { exact: true }).click();
    await expect.poll(() => db.school.count({ where: { id: school.id } })).toBe(0);
    expect(JSON.stringify(await (await context.request.get(`${api}/public/schools`)).json())).not.toContain(school.id);
    expect((await otherContext.request.post(`${api}/me/education/email/verify`, { data: { email: pendingEmail, code: pendingCode } })).status()).toBe(400);
    expect((await otherContext.request.post(`${api}/me/education/email/request-code`, { data: { email: `new-claim@${domain}` } })).status()).toBe(400);
    await db.user.update({ where: { id: account.id }, data: { referralCode: slug.toUpperCase(), nonEduReferralLimit: 3 } });
    expect((await otherContext.request.post(`${api}/me/education/invite`, { data: { referralCode: slug, schoolId: school.id } })).status()).toBe(400);
    const retained = await db.user.findUniqueOrThrow({ where: { id: account.id } });
    expect(retained.educationVerifiedAt).toEqual(verified.educationVerifiedAt);
    expect(retained.schoolId).toBeNull();
    expect((await (await context.request.get(`${api}/me/education`)).json()).verified).toBe(true);
    await visit(page, '/dashboard/me');
    await expect(page.getByRole('region', { name: '账号信息', exact: true }).getByText('教育用户', { exact: true })).toBeVisible();
    await info.attach('school-membership', { contentType: 'application/json', body: JSON.stringify({ creationAllowed:true, legacyFlagIgnored:true, removedFromPublicList:true, pendingCodeRejected:true, inviteRejected:true, existingIdentityRetained:true }) });
  } finally { await otherContext.close(); }
});

// Failure boundaries: a cached domain cannot grant education after removal or
// retain its former school after reassignment, including requests concurrent
// with the administrator's still-uncommitted catalogue change.
test('registration and education claims use the committed school domain owner', async ({ page, context, db, account, signedIn }, info) => {
  void signedIn;
  await db.user.update({ where: { id: account.id }, data: { educationVerifiedAt: null } });
  const source = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `catalogue-admin-${account.email}`, passwordHash: source.passwordHash } });
  expect((await context.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBe(true);
  const slug = `catalogue-${randomUUID()}`;
  const domain = `${slug}.example.test`;
  const create = async (suffix: string, domains: string[]) => {
    const response = await context.request.post(`${api}/admin/schools`, { data: { name: `合成目录学校 ${suffix}`, slug: `${slug}-${suffix}`, domains } });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const original = await create('source', [domain]);
  const destination = await create('target', [`target.${domain}`]);
  const outcomes: Record<string, boolean> = {};
  for (const phase of ['removed', 'reassigned'] as const) {
    if (phase === 'reassigned') {
      expect((await context.request.put(`${api}/admin/schools/${original.id}`, { data: { name: original.name, domains: [domain] } })).ok()).toBe(true);
    }
    const educationEmail = `${phase}-education@${domain}`;
    const registrationEmail = `${phase}-registration@${domain}`;
    expect((await context.request.post(`${api}/me/education/email/request-code`, { data: { email: educationEmail } })).ok()).toBe(true);
    const educationCode = await mailCode(page, educationEmail);
    expect((await context.request.post(`${api}/auth/request-code`, { data: { email: registrationEmail } })).ok()).toBe(true);
    const registrationCode = await mailCode(page, registrationEmail);
    const edited = phase === 'removed' ? original : destination;
    const domains = phase === 'removed' ? [`replacement.${domain}`] : [domain];
    let release!: () => void;
    let ready!: (pid: number) => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const locked = new Promise<number>(resolve => { ready = resolve; });
    const blocking = db.$transaction(async (tx: any) => {
      const [backend] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
      await tx.$queryRaw`SELECT "id" FROM "School" WHERE "id" = ${edited.id} FOR NO KEY UPDATE`;
      ready(backend.pid);
      await gate;
    }, { timeout: 20_000 });
    let updating: ReturnType<typeof context.request.put> | undefined;
    let verifying: ReturnType<typeof context.request.post> | undefined;
    let registering: ReturnType<typeof context.request.post> | undefined;
    try {
      const pid = await locked;
      updating = context.request.put(`${api}/admin/schools/${edited.id}`, { data: { name: edited.name, domains } });
      let writerPid = 0;
      await expect.poll(async () => {
        const waiting = await db.$queryRaw`SELECT pid FROM pg_stat_activity WHERE ${pid} = ANY(pg_blocking_pids(pid))`;
        writerPid = waiting[0]?.pid ?? 0;
        return writerPid;
      }).toBeGreaterThan(0);
      let settled = 0;
      verifying = context.request.post(`${api}/me/education/email/verify`, { data: { email: educationEmail, code: educationCode } }).then(response => { settled++; return response; });
      registering = context.request.post(`${api}/auth/register`, { data: { email: registrationEmail, code: registrationCode, password, acceptedTerms: true } }).then(response => { settled++; return response; });
      await expect.poll(async () => {
        const [waiting] = await db.$queryRaw`SELECT count(*)::int AS count FROM pg_stat_activity WHERE ${writerPid} = ANY(pg_blocking_pids(pid))`;
        return waiting.count + settled;
      }).toBeGreaterThanOrEqual(2);
      release();
      await blocking;
      const mutation = await updating;
      expect(mutation.ok(), await mutation.text()).toBe(true);
      expect((await registering).ok()).toBe(true);
      const persisted = await db.user.findUniqueOrThrow({ where: { email: registrationEmail } });
      const education = await verifying;
      if (phase === 'removed') {
        expect(education.status()).toBe(400);
        expect(persisted.educationVerifiedAt).toBeNull();
        expect(persisted.schoolId).toBeNull();
        expect((await db.user.findUniqueOrThrow({ where: { id: account.id } })).educationVerifiedAt).toBeNull();
      } else {
        expect(education.ok(), await education.text()).toBe(true);
        expect(persisted.schoolId).toBe(destination.id);
        expect(persisted.educationVerifiedAt).not.toBeNull();
        expect((await db.user.findUniqueOrThrow({ where: { id: account.id } })).schoolId).toBe(destination.id);
      }
      outcomes[phase] = true;
      expect((await context.request.post(`${api}/auth/login`, { data: { email: account.email, password } })).ok()).toBe(true);
    } finally {
      release();
      await Promise.allSettled([blocking, ...[updating, verifying, registering].filter(Boolean)]);
    }
  }
  await info.attach('school-catalogue-concurrency', { contentType: 'application/json', body: JSON.stringify({ assertions: { ...outcomes, realAdminMutation: true, registrationAndUpgradeAgree: true, staleCachedSchoolRejected: true } }) });
});

// Cancelled catalogue actions must be inert. Confirmed merges/deletions must
// synchronize user and questionnaire school references without erasing identity.
test('school edit merge and delete preserve user identity and questionnaire ownership @mobile @webkit', async ({ page, context, db, account, signedIn }, info) => {
  void signedIn;
  const originalUser = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `merge-admin-${account.email}`, passwordHash: originalUser.passwordHash } });
  expect((await context.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBe(true);
  const tag = `merge-${randomUUID()}`;
  const sourceName = `合成学校 ${tag} A`;
  const editedName = `${sourceName} 已编辑`;
  const targetName = `合成学校 ${tag} B`;
  const originalDomain = `original.${tag}.example.test`;
  const editedDomain = `edited.${tag}.example.test`;
  const targetDomain = `target.${tag}.example.test`;
  const source = await db.school.create({ data: { name: sourceName, slug: `${tag}-source`, domains: { create: { domain: originalDomain } } } });
  const target = await db.school.create({ data: { name: targetName, slug: `${tag}-target`, domains: { create: { domain: targetDomain } } } });
  const verifiedAt = new Date();
  const extraUser = await db.user.create({ data: { email: `${tag}@personal.example.test`, passwordHash: originalUser.passwordHash, displayName: '合成合并同学', status: 'ACTIVE', schoolId: source.id, educationVerifiedAt: verifiedAt, educationVerificationMethod: 'LEGACY' } });
  await db.user.update({ where: { id: account.id }, data: { schoolId: source.id, educationVerifiedAt: verifiedAt, educationVerificationMethod: 'LEGACY' } });
  const userIds = [account.id, extraUser.id];
  const version = await db.questionnaireVersion.findFirstOrThrow({ where: { isCurrent: true } });
  for (const userId of userIds) {
    const excludedSchools = userId === account.id ? [source.id] : [];
    const excludedGenders = userId === account.id ? [] : [{ schoolId: source.id, genders: ['女'] }];
    await db.questionnaireResponse.create({ data: { userId, versionId: version.id,
      answers: { [HARD_MATCH_KEYS.school]: source.id, [HARD_MATCH_KEYS.excludedPartnerSchools]: excludedSchools, [HARD_MATCH_KEYS.excludedPartnerSchoolGenders]: excludedGenders, syntheticAnswer: 'retained' },
      draftAnswers: { softAnswers: { syntheticAnswer: 'draft-retained' }, hardMatchForm: { excludedPartnerSchools: excludedSchools, excludedPartnerSchoolGenders: excludedGenders } },
    } });
  }
  async function expectOwnership(schoolId: string | null) {
    const users = await db.user.findMany({ where: { id: { in: userIds } } });
    expect(users).toHaveLength(2);
    for (const user of users) {
      expect(user.schoolId).toBe(schoolId);
      expect(user.educationVerifiedAt).toEqual(verifiedAt);
      expect(user.educationVerificationMethod).toBe('LEGACY');
    }
    const responses = await db.questionnaireResponse.findMany({ where: { userId: { in: userIds } } });
    expect(responses).toHaveLength(2);
    for (const response of responses) {
      const answers = response.answers as Record<string, unknown>;
      const draft = response.draftAnswers as { softAnswers: Record<string, unknown>; hardMatchForm: Record<string, unknown> };
      const excludedSchools = schoolId && response.userId === account.id ? [schoolId] : [];
      const excludedGenders = schoolId && response.userId !== account.id ? [{ schoolId, genders: ['女'] }] : [];
      expect(answers[HARD_MATCH_KEYS.school]).toBe(schoolId ?? NO_SCHOOL_ID);
      expect(answers[HARD_MATCH_KEYS.excludedPartnerSchools]).toEqual(excludedSchools);
      expect(answers[HARD_MATCH_KEYS.excludedPartnerSchoolGenders]).toEqual(excludedGenders);
      expect(answers.syntheticAnswer).toBe('retained');
      expect(draft.softAnswers.syntheticAnswer).toBe('draft-retained');
      expect(draft.hardMatchForm.excludedPartnerSchools).toEqual(excludedSchools);
      expect(draft.hardMatchForm.excludedPartnerSchoolGenders).toEqual(excludedGenders);
    }
  }
  async function answerDialog(action: () => Promise<void>, accept: boolean) {
    const pending = page.waitForEvent('dialog');
    const clicking = action();
    const dialog = await pending;
    const message = dialog.message();
    if (accept) await dialog.accept(); else await dialog.dismiss();
    await clicking;
    return message;
  }
  // SSR must not accept a search before React can retain the entered value.
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>(resolve => { releaseScripts = resolve; });
  const holdScripts = async (route: Route) => {
    await scriptsReady;
    await route.continue();
  };
  await page.route('**/_next/static/**/*.js', holdScripts);
  const search = page.getByRole('textbox', { name: '搜索学校', exact: true });
  const submitSearch = page.getByRole('button', { name: '搜索', exact: true });
  try {
    await page.goto('/admin/schools', { waitUntil: 'commit' });
    await expect(search).toBeVisible();
    await expect(search).toBeDisabled();
    await expect(submitSearch).toBeDisabled();
    releaseScripts();
    await expect(search).toBeEditable();
    await search.fill(tag);
    await expect(page.getByRole('button', { name: '清除搜索', exact: true })).toBeVisible();
    await expect(search).toHaveValue(tag);
    const searched = page.waitForResponse(response => {
      const url = new URL(response.url());
      return response.request().method() === 'GET' && url.pathname.endsWith('/admin/schools') && url.searchParams.get('search') === tag;
    });
    await submitSearch.click();
    const response = await searched;
    expect(response.ok()).toBe(true);
    const result = await response.json();
    expect(result.total).toBe(2);
    expect(result.items.map((school: { id: string }) => school.id).sort()).toEqual([source.id, target.id].sort());
    await expect(search).toHaveValue(tag);
    await info.attach('school-search-hydration-contract', { contentType: 'application/json', body: JSON.stringify({ project: info.project.name, syntheticOnly: true, assertions: { inputAndSubmitDisabledBeforeHydration: true, searchEditableAfterHydration: true, inputRecordedAndRetained: true, submittedSearchMatchesInput: true, onlyTwoMatchingSchoolsReturned: true } }) });
  } finally {
    releaseScripts();
    await page.unrouteAll({ behavior: 'wait' });
  }
  await expect(page.getByTitle('编辑', { exact: true })).toHaveCount(2);
  await page.getByTitle('编辑', { exact: true }).first().click();
  await page.getByLabel('学校名称', { exact: true }).fill(`${sourceName} 未提交`);
  await page.getByLabel('邮箱域名（逗号分隔）', { exact: true }).fill(editedDomain);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByText(sourceName, { exact: true })).toBeVisible();
  expect((await db.school.findUniqueOrThrow({ where: { id: source.id }, include: { domains: true } })).domains.map((entry: { domain: string }) => entry.domain)).toEqual([originalDomain]);
  await expectOwnership(source.id);
  await page.getByTitle('编辑', { exact: true }).first().click();
  await page.getByLabel('学校名称', { exact: true }).fill(editedName);
  await page.getByLabel('邮箱域名（逗号分隔）', { exact: true }).fill(editedDomain.toUpperCase());
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByText(editedName, { exact: true })).toBeVisible();
  expect((await db.school.findUniqueOrThrow({ where: { id: source.id } })).name).toBe(editedName);
  expect((await db.schoolDomain.findUniqueOrThrow({ where: { domain: editedDomain } })).schoolId).toBe(source.id);
  expect(await db.schoolDomain.count({ where: { domain: originalDomain } })).toBe(0);
  await page.getByTitle('选为合并来源', { exact: true }).first().click();
  await expect(page.getByText(`已选择「${editedName}」为合并来源，点击目标学校卡片上的「合并到此」完成合并。`, { exact: true })).toBeVisible();
  expect(await page.getByRole('button', { name: '合并到此', exact: true }).evaluate(button => button.scrollWidth <= button.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '取消合并', exact: true }).click();
  await expect(page.getByRole('button', { name: '合并到此', exact: true })).toHaveCount(0);
  await expectOwnership(source.id);
  await page.getByTitle('选为合并来源', { exact: true }).first().click();
  const cancelledMerge = await answerDialog(() => page.getByRole('button', { name: '合并到此', exact: true }).click(), false);
  expect(cancelledMerge).toContain(`「${editedName}」的所有用户和域名合并到「${targetName}」`);
  expect(await db.school.count({ where: { id: { in: [source.id, target.id] } } })).toBe(2);
  await expectOwnership(source.id);
  await page.screenshot({ path: info.outputPath('school-merge-selection.png'), fullPage: true });
  await answerDialog(() => page.getByRole('button', { name: '合并到此', exact: true }).click(), true);
  await expect(page.getByText(editedName, { exact: true })).toHaveCount(0);
  await expect(page.getByText(targetName, { exact: true })).toBeVisible();
  expect(await db.school.count({ where: { id: source.id } })).toBe(0);
  expect((await db.schoolDomain.findMany({ where: { schoolId: target.id }, orderBy: { domain: 'asc' } })).map((entry: { domain: string }) => entry.domain)).toEqual([editedDomain, targetDomain].sort());
  await expectOwnership(target.id);
  const cancelledDelete = await answerDialog(() => page.getByTitle('删除', { exact: true }).click(), false);
  expect(cancelledDelete).toContain('已有教育身份保留');
  expect(await db.school.count({ where: { id: target.id } })).toBe(1);
  await expectOwnership(target.id);
  await answerDialog(() => page.getByTitle('删除', { exact: true }).click(), true);
  await expect(page.getByText(targetName, { exact: true })).toHaveCount(0);
  await expect(page.getByText('没有找到匹配的学校。', { exact: true })).toBeVisible();
  expect(await db.school.count({ where: { id: { in: [source.id, target.id] } } })).toBe(0);
  expect(await db.schoolDomain.count({ where: { domain: { in: [originalDomain, editedDomain, targetDomain] } } })).toBe(0);
  await expectOwnership(null);
  await visit(page, '/dashboard/me');
  await expect(page.getByRole('region', { name: '账号信息', exact: true }).getByText('教育用户', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '教育认证', exact: true })).toContainText('已通过教育认证');
  await page.screenshot({ path: info.outputPath('school-delete-preserved-identity.png'), fullPage: true });
  await info.attach('school-edit-merge-delete-contract', { contentType: 'application/json', body: JSON.stringify({ project: info.project.name, syntheticOnly: true, assertions: { editCancellationInert: true, editedNameAndNormalizedDomainPersisted: true, mergeSelectionAndConfirmationCancellationInert: true, sourceRemoved: true, twoUsersMoved: true, domainsTransferred: true, answersAndDraftPreferencesRewritten: true, deleteCancellationInert: true, deletedSchoolAndDomainsRemoved: true, userSchoolAndQuestionnaireCleared: true, educationIdentityPreserved: true, unrelatedAnswersRetained: true } }) });
});

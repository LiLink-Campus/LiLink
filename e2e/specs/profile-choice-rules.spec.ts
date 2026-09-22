import { test, expect, api, visit, completeProfile } from '../support/fixtures';
import { readFileSync } from 'node:fs';
import path from 'node:path';

test.beforeEach(async ({ signedIn }) => { void signedIn; });

test('lifestyle choices form rows and persist after reload @smoke', async ({ page, context, db }, info) => {
  await completeProfile(context, db);
  const { questions } = await (await context.request.get(`${api}/questionnaire/current`)).json();
  for (const key of ['exercise_frequency', 'smoking_status', 'drinking_frequency']) {
    await visit(page, '/dashboard/profile');
    const q = questions.find((q: { key: string }) => q.key === key);
    const title = key === 'exercise_frequency' ? '锻炼情况' : q.prompt;
    await expect(page.getByRole('region', { name: '当前题目' })).toBeVisible();
    const directory = page.getByRole('button', { name: '题目目录', exact: true });
    if (await directory.isVisible()) await directory.click();
    await page.getByRole('button', { name: new RegExp(`关于你第 \\d+ 题：${title}$`) }).filter({ visible: true }).click();
    const group = page.getByRole('group', { name: title, exact: true });
    const radios = group.getByRole('radio');
    await expect(radios).toHaveCount(q.options.length);
    await expect(group.getByRole('slider')).toHaveCount(0);
    const boxes = await radios.evaluateAll(nodes => nodes.map(node => {
      const rect = node.closest('label')!.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
    }));
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].top).toBeGreaterThanOrEqual(boxes[i - 1].bottom);
      expect(boxes[i].left).toBe(boxes[0].left);
      expect(boxes[i].right).toBe(boxes[0].right);
    }
    await page.screenshot({ path: info.outputPath(`${key}.png`), fullPage: true });
    await radios.nth(1).check();
    await expect(page.getByText('全部修改已保存', { exact: true })).toBeVisible();
    const result = await (await context.request.get(`${api}/me/questionnaire`)).json();
    expect(result.answers[key]).toBe(q.options[1].value);
  }
});

test('four value questions require exactly three selections and keep incomplete edits as a draft @smoke', async ({ page, context, db }, info) => {
  await completeProfile(context, db);
  const { questions } = await (await context.request.get(`${api}/questionnaire/current`)).json();
  for (const key of ['values', 'red_flag_sensitivity', 'shared_growth_topics', 'feeling_cared_for']) {
    const q = questions.find((q: { key: string }) => q.key === key);
    expect(q.selectionLimit).toBe(3);
    await visit(page, '/dashboard/profile');
    await expect(page.getByRole('region', { name: '当前题目' })).toBeVisible();
    const directory = page.getByRole('button', { name: '题目目录', exact: true });
    if (await directory.isVisible()) await directory.click();
    await page.getByRole('button', { name: new RegExp(`价值观第 \\d+ 题：${q.prompt.replace(/[?？。.]/g, '.')}$`) }).filter({ visible: true }).click();
    const group = page.getByRole('group', { name: q.prompt, exact: true });
    const choices = group.getByRole('checkbox');
    await expect(group.getByText('本题必须选择 3 项。', { exact: true })).toBeVisible();
    await expect(choices.nth(3)).toBeDisabled();
    await group.getByText(q.options[0].label, { exact: true }).click();
    await expect(choices.nth(0)).not.toBeChecked();
    await expect(page.getByText('草稿已自动保存', { exact: true })).toBeVisible();
    await expect(choices.nth(3)).toBeEnabled();
    await page.screenshot({ path: info.outputPath(`${key}-two-selected.png`), fullPage: true });
    await group.getByText(q.options[3].label, { exact: true }).click();
    await expect(page.getByText('全部修改已保存', { exact: true })).toBeVisible();
    const saved = await (await context.request.get(`${api}/me/questionnaire`)).json();
    expect(saved.answers[key]).toEqual(q.options.slice(1, 4).map((option: { value: string }) => option.value));
    expect(saved.draft).toBeNull();
  }
});

test('page bootstraps retain account isolation, privacy headers and protected navigation', async ({ page, context, db, account }) => {
  await completeProfile(context, db);
  for (const [endpoint, route] of [['home', '/dashboard'], ['profile', '/dashboard/profile'], ['center', '/dashboard/me']]) {
    const response = await context.request.get(`${api}/me/page-bootstrap/${endpoint}`);
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['cache-control']).toContain('no-store');
    expect((await response.json()).user.id).toBe(account.id);
    await visit(page, route);
    await expect(page.getByRole('main')).toContainText(endpoint === 'profile' ? '全部修改已保存' : endpoint === 'center' ? '账号安全' : '自动化同学');
  }
  await context.clearCookies();
  expect((await context.request.get(`${api}/me/page-bootstrap/profile`)).status()).toBe(401);
});

test('choice-rule migration keeps historical definitions and submitted answers intact', async ({ db, context, account }) => {
  await completeProfile(context, db);
  const keys = ['values', 'red_flag_sensitivity', 'shared_growth_topics', 'feeling_cared_for'];
  const version = await db.questionnaireVersion.findFirstOrThrow({ where: { isCurrent: true } });
  const before = await db.questionnaireResponse.findUniqueOrThrow({ where: { userId: account.id } });
  const sql = readFileSync(path.join(process.env.E2E_WORKSPACE!, 'apps/api/prisma/migrations/20260921160000_require_three_profile_choices/migration.sql'), 'utf8');
  const rollback = new Error('rollback migration probe');
  await expect(db.$transaction(async (tx: any) => {
    const historical = await tx.questionnaireVersion.create({ data: { title: 'Historical test', isCurrent: false, questions: { create: { key: 'values', prompt: 'old', type: 'MULTI_SELECT', order: 1, selectionLimit: 4, options: [] } } } });
    await tx.question.updateMany({ where: { versionId: version.id, key: { in: keys } }, data: { selectionLimit: 4 } });
    expect(await tx.$executeRawUnsafe(sql)).toBe(4);
    const updated = await tx.question.findMany({ where: { versionId: version.id, key: { in: keys } } });
    expect(updated.every((q: { selectionLimit: number }) => q.selectionLimit === 3)).toBeTruthy();
    expect((await tx.question.findFirst({ where: { versionId: historical.id } })).selectionLimit).toBe(4);
    expect(await tx.questionnaireResponse.findUniqueOrThrow({ where: { userId: account.id } })).toEqual(before);
    throw rollback;
  })).rejects.toThrow('rollback migration probe');
});

// The lock simulates an unavailable backend in this runner's disposable database.
test('dashboard retry fetches fresh server data after a read timeout', async ({ page, db }, info) => {
  let release!: () => void;
  let acquired!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const ready = new Promise<void>(resolve => { acquired = resolve; });
  const blocked = db.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe('LOCK TABLE "QuestionnaireResponse" IN ACCESS EXCLUSIVE MODE');
    acquired();
    await hold;
  }, { timeout: 25_000 });
  try {
    await ready;
    await visit(page, '/dashboard/profile');
    await expect(page.getByRole('heading', { name: '暂时无法加载' })).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: info.outputPath('dashboard-timeout.png'), fullPage: true });
  } finally {
    release();
    await blocked;
  }
  await page.getByRole('button', { name: '重新加载', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '昵称', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '暂时无法加载' })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('dashboard-recovered.png'), fullPage: true });
});

import { test, expect, api, visit, completeProfile } from '../support/fixtures';
import type { Page } from '@playwright/test';

async function openQuestion(page: Page, title: string) {
  const directory = page.getByRole('button', { name: '题目目录', exact: true });
  if (await directory.isVisible()) await directory.click();
  await page.getByRole('button', { name: new RegExp(`关于你第 \\d+ 题：${title}$`) }).filter({ visible: true }).click();
}

// Boundaries: an invalid nickname blocks the entire save, even on another
// question; report the actual field, retain edits, and recover after correction.
test('save errors identify nickname while editing intro and preserve recovery @mobile @webkit', async ({ page, context, db, account, signedIn }, info) => {
  void signedIn;
  await completeProfile(context, db);
  await visit(page, '/dashboard/profile');
  const name = page.getByRole('textbox', { name: '昵称', exact: true });
  await name.fill('短');
  const notice = page.getByRole('status', { name: '问卷保存状态' });
  await expect(notice).toContainText('昵称至少需要 2 个字符');
  await openQuestion(page, '一句话介绍');
  const intro = page.getByRole('textbox', { name: /一句话介绍/ });
  const draft = '这段介绍在修正昵称后应一并保存。';
  await intro.fill(draft);
  await expect(notice).toContainText('昵称至少需要 2 个字符');
  await expect(notice).toContainText('关于你 → 昵称');
  await expect(notice).toContainText('尚未保存');
  await expect(intro).toHaveValue(draft);
  expect((await db.user.findUniqueOrThrow({ where: { id: account.id } })).displayName).toBe('自动化同学');
  await page.screenshot({ path: info.outputPath('nickname-error-on-intro.png') });
  await openQuestion(page, '昵称');
  await name.fill('修正后的昵称');
  await expect(notice).toContainText('全部修改已保存');
  const saved = await (await context.request.get(`${api}/me/questionnaire`)).json();
  expect(saved.answers.hard_one_liner_intro).toBe(draft);
  expect((await db.user.findUniqueOrThrow({ where: { id: account.id } })).displayName).toBe('修正后的昵称');
  await info.attach('save-error-recovery', { contentType: 'application/json', body: JSON.stringify({ realValidation400: true, correctFieldVisibleOnAnotherQuestion: true, unsavedIntroPreserved: true, correctedNameAndIntroPersisted: true }) });
});

// A Chinese field error returned by the server must reach the notice rather
// than being replaced with a generic instruction to refresh and retry.
test('save errors retain server field instructions @mobile @webkit', async ({ page, context, db, signedIn }, info) => {
  void signedIn;
  await completeProfile(context, db);
  await visit(page, '/dashboard/profile');
  await page.route('**/api/questionnaire', route => route.fulfill({ status: 400, json: { message: '一句话介绍请不要超过 200 字。' } }));
  await openQuestion(page, '一句话介绍');
  await page.getByRole('textbox', { name: /一句话介绍/ }).fill('服务端校验提示测试');
  const notice = page.getByRole('status', { name: '问卷保存状态' });
  await expect(notice).toContainText('一句话介绍请不要超过 200 字。');
  await expect(notice).toContainText('尚未保存');
  await expect(notice).not.toContainText('刷新');
  await page.screenshot({ path: info.outputPath('intro-field-error.png') });
  await info.attach('server-error-visible', { contentType: 'application/json', body: JSON.stringify({ serverFieldMessageVisible: true, refreshNotSuggested: true }) });
});

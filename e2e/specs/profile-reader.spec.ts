import type { Page } from '@playwright/test';
import { test, expect, visit, completeProfile, api } from '../support/fixtures';
import { focus, vipInactive } from '../support/vip-refresh';

// Failure boundaries: input/save updates preserve focus, cursor and scroll;
// animation cancellation never leaves a blank or non-editable selected item.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });
test.beforeEach(async ({ signedIn }) => { void signedIn; });

async function openQuestion(page: Page, title: string, module = '关于你') {
  await expect(page.getByRole('region', { name: '当前题目' })).toBeVisible();
  const directory = page.getByRole('button', { name: '题目目录', exact: true });
  if (await directory.isVisible()) await directory.click();
  await page.getByRole('button', { name: new RegExp(`${module}第 \\d+ 题：${title}$`) }).filter({ visible: true }).click();
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test.describe(`reader ${reducedMotion}`, () => {
    test.use({ contextOptions: { reducedMotion } });
    test('continuous typing keeps focus, cursor, selected question and saved value @smoke', async ({ page, context, db }, info) => {
      await completeProfile(context, db);
      await visit(page, '/dashboard/profile');
      await openQuestion(page, '一句话介绍');
      const intro = page.getByRole('textbox', { name: /一句话介绍/ });
      await intro.fill('可复现输入');
      for (let n = 0; n < 4; n++) await intro.press('ArrowLeft');
      await intro.pressSequentially('光标保持', { delay: 20 });
      await expect(intro).toBeFocused();
      await expect(intro).toHaveValue('可光标保持复现输入');
      expect(await intro.evaluate(element => (element as HTMLTextAreaElement).selectionStart)).toBe(5);
      await expect(page.getByRole('main').getByText('全部修改已保存', { exact: true })).toBeVisible();
      await expect(intro).toBeFocused();
      await expect(page.locator('[data-reader-hidden="false"]')).toHaveCount(1);
      await page.getByRole('button', { name: '下一题 →', exact: true }).click();
      await page.getByRole('button', { name: '← 上一题', exact: true }).click();
      await expect(intro).toHaveValue('可光标保持复现输入');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await openQuestion(page, '一句话介绍');
      await expect(intro).toHaveValue('可光标保持复现输入');
      const saved = await (await context.request.get(`${api}/me/questionnaire`)).json();
      expect(saved.answers.hard_one_liner_intro).toBe('可光标保持复现输入');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await info.attach('reader-input-saved', { body: await page.screenshot(), contentType: 'image/png' });
    });

    test('automatic next question and rapid navigation keep final editable selection @smoke', async ({ page, context, db }, info) => {
      await completeProfile(context, db);
      await visit(page, '/dashboard/profile');
      await openQuestion(page, '性别');
      await page.getByRole('radio', { name: '男', exact: true }).check();
      await expect(page.getByRole('slider', { name: '颜值自评', exact: true })).toBeVisible();
      await openQuestion(page, '性别');
      const leaving = page.getByRole('radio', { name: '女', exact: true }).locator('xpath=ancestor::*[@data-reader-item][1]');
      await page.getByRole('radio', { name: '女', exact: true }).check();
      if (reducedMotion === 'no-preference') {
        await expect.poll(() => leaving.evaluate(node => node.getAnimations().some(animation => animation.playState === 'running')),
          { intervals: [10], timeout: 3000 }).toBe(true);
      }
      await openQuestion(page, '昵称');
      const name = page.getByRole('textbox', { name: '昵称', exact: true });
      await expect(name).toBeEditable();
      await name.fill('动画后可编辑');
      await expect(page.getByRole('main').getByText('全部修改已保存', { exact: true })).toBeVisible();
      await expect(name).toBeVisible();
      await expect(page.locator('[data-reader-hidden="false"]')).toHaveCount(1);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(name).toHaveValue('动画后可编辑');
      await openQuestion(page, '性别');
      await expect(page.getByRole('radio', { name: '女', exact: true })).toBeChecked();
      await info.attach('reader-navigation-recovered', { body: await page.screenshot(), contentType: 'image/png' });
    });

    test('VIP revocation during automatic navigation leaves a visible editable question', async ({ page, context, db, account }, info) => {
      await completeProfile(context, db);
      await db.vipActivation.create({ data: { codeHash: `reader-${account.id}`, batch: 'e2e-reader',
        userId: account.id, activatedAt: new Date(), expiresAt: new Date('2030-01-01') } });
      await visit(page, '/dashboard/profile');
      await openQuestion(page, '性别');
      const leaving = page.getByRole('radio', { name: '男', exact: true }).locator('xpath=ancestor::*[@data-reader-item][1]');
      await page.route('**/v1/me/vip', route => route.fulfill({ json: vipInactive }));
      await page.getByRole('radio', { name: '男', exact: true }).check();
      if (reducedMotion === 'no-preference') {
        await expect.poll(() => leaving.evaluate(node => node.getAnimations().some(animation => animation.playState === 'running')),
          { intervals: [10], timeout: 3000 }).toBe(true);
      }
      const refreshed = page.waitForResponse(response => response.url().endsWith('/me/vip') && response.ok());
      await focus(page);
      await refreshed;
      await expect(page.getByRole('main').locator('[data-reader-item]').filter({ hasText: '希望对方锻炼频率' })).toContainText('需要 VIP，开通后可设置');
      await expect(leaving).toBeVisible();
      await expect(leaving).toHaveCSS('opacity', '1');
      await expect.poll(() => leaving.evaluate(node => node.getAnimations().length)).toBe(0);
      await expect(page.getByRole('radio', { name: '男', exact: true })).toBeChecked();
      await expect(page.locator('[data-reader-hidden="false"]')).toHaveCount(1);
      await openQuestion(page, '希望对方锻炼频率', '希望遇见谁');
      await expect(page.getByText('高级筛选 · 需要 VIP，开通后可设置', { exact: true }).filter({ visible: true })).toBeVisible();
      await openQuestion(page, '一句话介绍');
      const intro = page.getByRole('textbox', { name: /一句话介绍/ });
      await expect(intro).toBeEditable();
      await intro.fill('权益变化之后仍可填写');
      await expect(page.getByRole('main').getByText('全部修改已保存', { exact: true })).toBeVisible();
      await expect(intro).toHaveValue('权益变化之后仍可填写');
      await info.attach('reader-after-vip-change', { body: await page.screenshot(), contentType: 'image/png' });
    });
  });
}

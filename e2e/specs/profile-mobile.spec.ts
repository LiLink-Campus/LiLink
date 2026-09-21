import type { Locator, Page } from '@playwright/test';
import { test, expect, visit } from '../support/fixtures';

test.beforeEach(async ({ signedIn }) => { void signedIn; });

async function openQuestion(page: Page, title: string) {
  await page.getByRole('button', { name: '题目目录', exact: true }).click();
  await page.getByRole('dialog', { name: '题目目录' })
    .getByRole('button', { name: new RegExp(`关于你第 \\d+ 题：${title}$`) }).click();
}

async function revealByPageScroll(page: Page, target: Locator) {
  // Scroll the document as a phone user would, never the nested question card.
  await target.evaluate(element => {
    window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - 110, behavior: 'instant' });
  });
  await expect(target).toBeInViewport({ ratio: 1 });
  await expect.poll(() => target.evaluate(element => {
    const r = element.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return element === hit || element.contains(hit);
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const viewport of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 420, height: 740 }, { width: 879, height: 700 }]) {
  test(`mobile questionnaire controls stay reachable by page scrolling at ${viewport.width}x${viewport.height} @smoke`, async ({ page, db, account }, testInfo) => {
    await page.setViewportSize(viewport);
    const version = await db.questionnaireVersion.findFirstOrThrow({ where: { isCurrent: true } });
    await db.questionnaireResponse.create({ data: { userId: account.id, versionId: version.id, answers: {} } });
    await visit(page, '/dashboard/profile');

    await openQuestion(page, '一句话介绍');
    await revealByPageScroll(page, page.getByRole('textbox', { name: /一句话介绍/ }));
    await page.screenshot({ path: testInfo.outputPath('intro.png') });

    await openQuestion(page, '联系方式');
    await revealByPageScroll(page, page.getByRole('textbox', { name: /内容$/ }));
    await page.screenshot({ path: testInfo.outputPath('contact.png') });

    await openQuestion(page, '性别');
    const lastGender = page.locator('[data-reader-hidden="false"] [data-choice]').last();
    await revealByPageScroll(page, lastGender);
    await page.screenshot({ path: testInfo.outputPath('gender.png') });

    await openQuestion(page, '颜值自评');
    const slider = page.getByRole('slider', { name: '颜值自评', exact: true });
    await expect(slider).toHaveAttribute('aria-valuetext', '未选择');
    await revealByPageScroll(page, slider);
    await page.screenshot({ path: testInfo.outputPath('looks.png') });
    await revealByPageScroll(page, page.getByRole('button', { name: '下一题 →', exact: true }));
    await page.getByRole('button', { name: '下一题 →', exact: true }).click();
    await expect(page.locator('[data-reader-hidden="false"] [data-question-title]')).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('combobox', { name: '选择你的身高' })).toBeVisible();
  });
}

test('mobile profile remains editable when available viewport height changes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, '/dashboard/profile');
  await openQuestion(page, '一句话介绍');
  const intro = page.getByRole('textbox', { name: /一句话介绍/ });
  await intro.fill('可视高度变化后仍然保留的合成测试介绍');
  // This models reduced space, not a claim of physical on-screen keyboard coverage.
  await page.setViewportSize({ width: 390, height: 400 });
  await revealByPageScroll(page, intro);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(intro).toHaveValue('可视高度变化后仍然保留的合成测试介绍');
  await expect(page.getByRole('main').getByText('草稿已自动保存', { exact: true })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openQuestion(page, '一句话介绍');
  await expect(intro).toHaveValue('可视高度变化后仍然保留的合成测试介绍');
});

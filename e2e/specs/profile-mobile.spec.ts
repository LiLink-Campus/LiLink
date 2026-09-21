import type { Locator, Page } from '@playwright/test';
import { test, expect, visit } from '../support/fixtures';

test.beforeEach(async ({ signedIn }) => { void signedIn; });

async function openQuestion(page: Page, title: string, group = '关于你') {
  const directory = page.getByRole('button', { name: '题目目录', exact: true });
  if (await directory.isVisible()) await directory.click();
  await page.getByRole('button', { name: new RegExp(`${group}第 \\d+ 题：${title}$`) }).filter({ visible: true }).click();
}

async function expectActionsAtBottom(page: Page) {
  const next = page.getByRole('button', { name: '下一题 →', exact: true });
  await expect(next).toBeInViewport({ ratio: 1 });
  const gap = await next.evaluate(element => {
    const tabbar = document.querySelector('nav[aria-label="底部导航"]');
    const navRect = tabbar?.getBoundingClientRect();
    const bottom = navRect && navRect.height > 0 ? navRect.top : innerHeight;
    return bottom - element.getBoundingClientRect().bottom;
  });
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThanOrEqual(40);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function revealQuestionControl(page: Page, target: Locator) {
  const next = page.getByRole('button', { name: '下一题 →', exact: true });
  const before = await next.boundingBox();
  await target.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await expect(target).toBeInViewport({ ratio: 1 });
  await expect.poll(() => target.evaluate(element => {
    const r = element.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return element === hit || element.contains(hit);
  })).toBe(true);
  expect((await next.boundingBox())!.y).toBeCloseTo(before!.y, 0);
  await expectActionsAtBottom(page);
}

const viewports = [
  { width: 320, height: 568 }, { width: 360, height: 640 }, { width: 420, height: 740 },
  { width: 446, height: 904 }, { width: 760, height: 1100 }, { width: 879, height: 700 },
  { width: 880, height: 650 }, { width: 1280, height: 900 }, { width: 1440, height: 1200 },
];
for (const viewport of viewports) {
  test(`questionnaire actions stay at bottom at ${viewport.width}x${viewport.height} @smoke`, async ({ page, db, account }, testInfo) => {
    await page.setViewportSize(viewport);
    const version = await db.questionnaireVersion.findFirstOrThrow({ where: { isCurrent: true } });
    await db.questionnaireResponse.create({ data: { userId: account.id, versionId: version.id, answers: {} } });
    await visit(page, '/dashboard/profile');
    await expectActionsAtBottom(page);
    await page.screenshot({ path: testInfo.outputPath('nickname.png') });

    await openQuestion(page, '一句话介绍');
    await revealQuestionControl(page, page.getByRole('textbox', { name: /一句话介绍/ }));
    await page.screenshot({ path: testInfo.outputPath('intro.png') });
    await openQuestion(page, '联系方式');
    await revealQuestionControl(page, page.getByRole('textbox', { name: /内容$/ }));
    await page.screenshot({ path: testInfo.outputPath('contact.png') });
    await openQuestion(page, '性别');
    await revealQuestionControl(page, page.locator('[data-reader-hidden="false"] [data-choice]').last());
    await page.screenshot({ path: testInfo.outputPath('gender.png') });
    await openQuestion(page, '颜值自评');
    const slider = page.getByRole('slider', { name: '颜值自评', exact: true });
    await expect(slider).toHaveAttribute('aria-valuetext', '未选择');
    await revealQuestionControl(page, slider);
    await page.screenshot({ path: testInfo.outputPath('looks.png') });
    await page.getByRole('button', { name: '下一题 →', exact: true }).click();
    await expect(page.locator('[data-reader-hidden="false"] [data-question-title]')).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole('region', { name: '当前题目' })).toHaveJSProperty('scrollTop', 0);
    await expectActionsAtBottom(page);
  });
}

test('mobile profile remains editable when available viewport height changes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await visit(page, '/dashboard/profile');
  await openQuestion(page, '一句话介绍');
  const intro = page.getByRole('textbox', { name: /一句话介绍/ });
  await intro.fill('可视高度变化后仍然保留的合成测试介绍');
  // Reduced space is not physical on-screen keyboard coverage.
  await page.setViewportSize({ width: 390, height: 400 });
  await revealQuestionControl(page, intro);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(intro).toHaveValue('可视高度变化后仍然保留的合成测试介绍');
  await expect(page.getByRole('main').getByText('草稿已自动保存', { exact: true })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openQuestion(page, '一句话介绍');
  await expect(intro).toHaveValue('可视高度变化后仍然保留的合成测试介绍');
});

test('scroll hints follow hidden content and keep actions stable @smoke', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await visit(page, '/dashboard/profile');
  const main = page.getByRole('main');
  const down = main.getByText('↓ 下方还有内容', { exact: true });
  await expect(down).not.toBeVisible();
  await openQuestion(page, '希望对方吸烟情况', '希望遇见谁');
  const reader = page.getByRole('region', { name: '当前题目' });
  await expect(down).toBeVisible();
  const hintBox = await down.boundingBox();
  const readerBox = await reader.boundingBox();
  expect(hintBox!.y).toBeGreaterThan(readerBox!.y);
  expect(hintBox!.y + hintBox!.height).toBeLessThanOrEqual(readerBox!.y + readerBox!.height);
  await page.screenshot({ path: testInfo.outputPath('scroll-hint-top.png') });
  const next = page.getByRole('button', { name: '下一题 →', exact: true });
  const before = await next.boundingBox();
  await reader.evaluate(element => { element.scrollTop = (element.scrollHeight - element.clientHeight) / 2; });
  await expect(down).toBeVisible();
  await reader.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(down).not.toBeVisible();
  const lastOption = page.locator('[data-reader-hidden="false"] [data-choice]').last();
  await expect(lastOption).toBeInViewport({ ratio: 1 });
  expect((await next.boundingBox())!.y).toBeCloseTo(before!.y, 0);
  await expectActionsAtBottom(page);
  await page.screenshot({ path: testInfo.outputPath('scroll-hint-bottom.png') });

  await next.click();
  await expect(reader).toHaveJSProperty('scrollTop', 0);
  await expect(down).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1200 });
  await expect(down).not.toBeVisible();
  await page.setViewportSize({ width: 360, height: 640 });
  await expect(down).toBeVisible();
  await openQuestion(page, '昵称');
  await expect(down).not.toBeVisible();
});

import { test, expect, visit } from '../support/fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test('founder profile keeps only homepage and removes biography @webkit @mobile', async ({ page }, info) => {
  await visit(page, '/about/team/yoryon');
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: '釉蓝yoryon', exact: true })).toBeVisible();
  await expect(main.getByText('创始人 & 产品负责人', { exact: true })).toBeVisible();
  const homepage = main.getByRole('link', { name: '个人主页 ↗', exact: true });
  await expect(homepage).toHaveAttribute('href', 'https://yoryon.com');
  await expect(homepage).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(main.getByRole('link', { name: '← 返回团队', exact: true })).toBeVisible();
  await expect(main.getByRole('link')).toHaveCount(2);
  await expect(main.getByText(/工作微信号|公众号|小红书|抖音|GitHub|有合作、投诉|无病呻吟|正常的技术博客/)).toHaveCount(0);
  const portrait = main.getByRole('img', { name: '釉蓝yoryon 的蓝色插画头像' });
  await expect.poll(() => portrait.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('founder-profile.png'), fullPage: true });
  await main.getByRole('link', { name: '← 返回团队', exact: true }).click();
  await expect(page).toHaveURL(/\/about#team-title$/);
  await visit(page, '/about/team/member-02');
  await expect(page.getByRole('main').getByText('我是lilink的主要增长和运营负责人。', { exact: true })).toBeVisible();
  await visit(page, '/about/team/devillord6321');
  await expect(page.getByRole('main').getByRole('link', { name: 'GitHub ↗', exact: true })).toHaveAttribute('href', 'https://github.com/Devillord6321');
});

 test('founder introduction opens homepage in a new tab @webkit @mobile', async ({ page, context }, info) => {
  await context.route('https://yoryon.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Homepage fixture</title><main>Homepage fixture</main>' }));
  await visit(page, '/about');
  const link = page.getByRole('article').filter({ has: page.getByRole('heading', { name: '釉蓝yoryon', exact: true }) }).getByRole('link', { name: '查看介绍 ↗', exact: true });
  await expect(link).toHaveAttribute('href', 'https://yoryon.com');
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  const popupPromise = page.waitForEvent('popup');
  await link.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL('https://yoryon.com/');
  await expect(page).toHaveURL(/\/about$/);
  await link.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('team-external-link.png'), fullPage: true });
  await popup.close();
});

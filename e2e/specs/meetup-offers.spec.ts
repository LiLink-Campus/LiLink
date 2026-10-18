import { test, expect } from '@playwright/test';

for (const width of [390, 700, 701, 1280]) {
  test(`商家优惠与自愿加微信 ${width}px @mobile @webkit`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const couponRequests: string[] = [];
    page.on('request', request => {
      if (/\/me\/coupons|\/redeem|\/coupon-claims/.test(request.url())) couponRequests.push(request.url());
    });
    await page.goto('/meetups');
    await expect(page.getByRole('heading', { name: '下一次见面， 多一个好去处。' })).toBeVisible();
    const main = page.getByRole('main');
    await expect(page.getByRole('banner').getByRole('link', { name: 'LiLink 首页' })).toBeVisible();
    await expect(main.getByRole('link', { name: '← 返回', exact: true })).toHaveAttribute('href', '/dashboard');
    await expect(page.getByRole('contentinfo').getByRole('heading', { name: '关注我们' })).toBeVisible();
    await expect(main.getByRole('img')).toHaveCount(6);
    const imageUrls = await main.getByRole('img').evaluateAll(elements => elements.map(element => getComputedStyle(element).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1]));
    for (const url of new Set(imageUrls)) {
      expect(url).toBeTruthy();
      const response = await page.request.get(url!);
      expect(response.ok()).toBe(true);
      expect(response.headers()['content-type']).toMatch(/^image\//);
    }
    for (const name of ['牛约', 'Vibes', 'Social', '玩学家工坊']) {
      const card = main.getByRole('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
      const photoCoversFrame = await card.getByRole('img').evaluate(image => {
        const frame = image.parentElement!.getBoundingClientRect();
        const picture = image.getBoundingClientRect();
        return picture.left <= frame.left + 1 && picture.top <= frame.top + 1 && picture.right >= frame.right - 1 && picture.bottom >= frame.bottom - 1;
      });
      expect(photoCoversFrame).toBe(true);
      await card.getByText('使用说明与待确认信息', { exact: true }).click();
      await expect(card.getByText('门店地址、活动日期及是否与其他优惠同享待确认。本地预览不作为实际优惠凭证。')).toBeVisible();
      await card.getByRole('button', { name: '到店出示' }).click();
      const dialog = page.getByRole('dialog', { name });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('本地预览 · 暂不可作为优惠凭证', { exact: true })).toBeVisible();
      await expect(dialog.getByRole('listitem')).toHaveText(await card.getByRole('listitem').allTextContents());
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
    }
    const first = main.getByRole('article').first();
    await first.getByRole('button', { name: '到店出示' }).click();
    await page.getByRole('button', { name: '之后一起组局？添加运营微信 ↗' }).click();
    const wechat = page.getByRole('dialog', { name: '添加 LiLink 运营微信' });
    await expect(wechat).toBeVisible();
    const qr = wechat.getByRole('link', { name: '查看 LiLink 微信二维码原图' });
    const homepage = await page.request.get('/');
    expect(homepage.ok()).toBe(true);
    expect(await homepage.text()).toContain((await qr.getAttribute('href'))!);
    await expect(qr.locator('img')).toBeVisible();
    expect(await qr.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('wechat.png') });
    await wechat.getByRole('button', { name: '关闭微信弹窗' }).click();
    await main.getByRole('button', { name: '添加运营微信 ↗', exact: true }).click();
    await expect(wechat).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(couponRequests).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath('page.png'), fullPage: true });
    await testInfo.attach('acceptance', { body: JSON.stringify({ width, browser: testInfo.project.name, merchants: 4, couponRequests: 0, wechatMatchesHomepage: true, assertions: '四家优惠、说明展开、出示卡、Escape、微信入口、二维码加载、无横向溢出' }), contentType: 'application/json' });
  });
}

import { test, expect, visit } from '../support/fixtures';

for (const route of ['/login', '/register', '/forgot-password']) {
  test(`public page layout and baseline ${route} @visual`, async ({ page, isMobile }) => {
    await visit(page, route);
    // Closing the announcement can leave the pointer over a choice card.
    if (!isMobile) await page.mouse.move(0, 0);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByRole('main')).toHaveScreenshot(`${route.slice(1)}.png`, { animations: 'disabled' });
  });
}

test('VIP support dialog fits viewport @visual', async ({ page, signedIn, isMobile }) => {
  void signedIn;
  await visit(page, '/dashboard/vip');
  await page.getByRole('button', { name: '联系客服', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  if (!isMobile) await page.mouse.move(0, 0);
  await expect(dialog).toHaveScreenshot('vip-support.png', { animations: 'disabled' });
  const bounds = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(dialog).not.toBeVisible();
});

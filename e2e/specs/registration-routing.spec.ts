import { test, expect, visit, api } from '../support/fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// Layout boundary: the school helper must not add a blank form row; wrapped
// helper content must still end before the code label at narrow widths.
test('school and personal email rows use equal spacing @mobile @webkit', async ({ page }, info) => {
  const original = page.viewportSize()!;
  const widths = info.project.name === 'chromium' ? [320, 375, 766, 1280] : [original.width];
  const measurements = [];
  async function gap() {
    return page.evaluate(() => {
      const email = document.querySelector<HTMLInputElement>('input[type=email]')!;
      const code = document.querySelector<HTMLInputElement>('input[autocomplete=one-time-code]')!;
      return code.closest('label')!.getBoundingClientRect().top - email.getBoundingClientRect().bottom;
    });
  }
  for (const width of widths) {
    await page.setViewportSize({ width, height: original.height });
    await visit(page, '/register/personal');
    await expect(page.getByLabel('普通邮箱', { exact: true })).toBeEnabled();
    const baseline = await gap();
    await visit(page, '/register/school');
    await expect(page.getByLabel('学校邮箱', { exact: true })).toBeEnabled();
    const empty = await gap();
    expect(Math.abs(empty - baseline)).toBeLessThan(1);
    await page.getByLabel('学校邮箱', { exact: true }).fill('preview@school.example.test');
    await expect(page.getByRole('status').filter({ hasText: '✓' })).toBeVisible();
    const matched = await gap();
    expect(Math.abs(matched - baseline)).toBeLessThan(1);
    await page.getByLabel('学校邮箱', { exact: true }).fill('preview@personal.example.test');
    await expect(page.getByRole('link', { name: '改用普通邮箱注册', exact: true })).toBeVisible();
    const layout = await page.evaluate(() => {
      const link = Array.from(document.querySelectorAll('form a')).find(a => a.textContent === '改用普通邮箱注册')!;
      const helper = link.parentElement!.parentElement!.getBoundingClientRect();
      const code = document.querySelector('input[autocomplete=one-time-code]')!.closest('label')!.getBoundingClientRect();
      return { helperBottom: helper.bottom, codeTop: code.top, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(layout.helperBottom).toBeLessThanOrEqual(layout.codeTop + 1);
    expect(layout.overflow).toBe(false);
    measurements.push({ width, baseline, empty, matched, ...layout });
  }
  await info.attach('email-row-spacing', { body: JSON.stringify(measurements), contentType: 'application/json' });
  await info.attach('email-row-spacing-preview', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});

// Failure boundaries: unsupported domains must prompt only after sending,
// never request a school code, preserve the destination, and allow keyboard exit.
test('unsupported school email uses one switch link and a dismissible prompt @mobile @webkit', async ({ page }, info) => {
  let codeRequests = 0;
  page.on('request', request => { if (request.url() === `${api}/auth/request-code`) codeRequests++; });
  await visit(page, '/register/school?next=%2Fdashboard%2Fme');
  await page.getByLabel('学校邮箱', { exact: true }).fill('preview@personal.example.test');
  const switchLink = page.getByRole('link', { name: '改用普通邮箱注册', exact: true });
  await expect(switchLink).toBeVisible();
  await expect(switchLink).toHaveCount(1);
  await expect(page.getByText('暂不支持此邮箱后缀', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: '发送验证码', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '请使用普通邮箱注册' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('该邮箱后缀不在合作学校白名单内。请改用普通邮箱注册。', { exact: true })).toBeVisible();
  expect(codeRequests).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await info.attach('school-email-prompt', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  if (info.project.name === 'chromium') {
    const original = page.viewportSize()!;
    for (const width of [320, 375, 766, 879, 880, 1280]) {
      await page.setViewportSize({ width, height: 896 });
      await expect(dialog).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const bounds = (await dialog.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(896);
    }
    await page.setViewportSize(original);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: '发送验证码', exact: true })).toBeFocused();
  await page.getByRole('button', { name: '发送验证码', exact: true }).click();
  await dialog.getByRole('button', { name: '返回修改邮箱' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: '发送验证码', exact: true }).click();
  await dialog.getByRole('link', { name: '改用普通邮箱注册', exact: true }).click();
  await expect(page).toHaveURL(/\/register\/personal\?/);
  expect(new URL(page.url()).searchParams.get('next')).toBe('/dashboard/me');
  await expect(page.getByLabel('邀请码', { exact: true })).toHaveCount(0);
});

test('school eligibility change returned by the API opens the same prompt @mobile @webkit', async ({ page }) => {
  await page.route(`${api}/auth/request-code`, route => route.fulfill({
    json: { registrationMode: 'ORDINARY_EMAIL', school: null },
  }));
  await visit(page, '/register/school');
  await page.getByLabel('学校邮箱', { exact: true }).fill('preview@school.example.test');
  await expect(page.getByRole('status').filter({ hasText: '✓' })).toBeVisible();
  await page.getByRole('button', { name: '发送验证码', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '请使用普通邮箱注册' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: '改用普通邮箱注册' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '验证码已发送' })).toHaveCount(0);
});

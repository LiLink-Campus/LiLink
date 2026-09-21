import { test, expect, visit } from '../support/fixtures';

const listName = '各学校已加入人数';

test('community snapshot survives refresh failure and recovers at 30 seconds @smoke', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  // The runner builds before starting the API; warm the first successful snapshot.
  const warm = await page.request.get('/api/public/community');
  expect(warm.ok()).toBeTruthy();
  expect(warm.headers()['cache-control']).toContain('s-maxage=30');
  await expect.poll(async () => {
    const response = await page.request.get('/');
    return (await response.text()).includes(listName);
  }, { timeout: 80_000, intervals: [1000, 5000] }).toBeTruthy();

  let attempts = 0;
  let recovered = false;
  await page.route('**/api/public/community', route => {
    attempts++;
    return recovered ? route.fulfill({ json: {
      total: 42, genders: { male: 18, female: 19, nonBinary: 3, unknown: 2 },
      schools: [{ id: 'recovered', name: '恢复后的示例大学', count: 42 }],
      generatedAt: new Date().toISOString(),
    } }) : route.fulfill({ status: 503, json: { message: 'Unavailable' } });
  });
  await page.clock.install();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('list', { name: listName })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '上次成功统计；每 30 秒自动重试' })).toBeVisible();
  expect(attempts).toBe(1);
  await page.getByRole('heading', { name: '在这里，遇见同学' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('saved-stats-on-failure.png') });
  await page.clock.fastForward(29_000);
  expect(attempts).toBe(1);
  recovered = true;
  await page.clock.fastForward(1_000);
  await expect(page.getByText('恢复后的示例大学')).toBeVisible();
  expect(attempts).toBe(2);
  await expect(page.getByRole('status').filter({ hasText: '每 30 秒自动重试' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('recovered-stats.png') });
});

test('school discovery uses the anonymous cached endpoint @smoke', async ({ page }) => {
  const response = await page.request.get('/api/public/schools');
  expect(response.ok()).toBeTruthy();
  expect(response.headers()['cache-control']).toContain('s-maxage=60');
  const payload = await response.json();
  expect(payload.schools.some((school: { domains: string[] }) => school.domains.includes('school.example.test'))).toBeTruthy();
  await visit(page, '/register/school');
  await page.getByLabel('学校邮箱', { exact: true }).fill('student@school.example.test');
  const school = payload.schools.find((item: { domains: string[] }) => item.domains.includes('school.example.test'));
  await expect(page.getByText(`✓ ${school.name}`, { exact: true })).toBeVisible();
});

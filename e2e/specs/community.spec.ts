import { test, expect, visit } from '../support/fixtures';

const listName = '各学校已加入人数';
const snapshotRequest = /\/(?:api\/)?public\/(?:home|community)(?:$|[/?])/;

// Failure boundaries: server-rendered statistics must remain visible without
// browser reads; elapsed time and visibility changes must not trigger refreshes.
test('homepage keeps its server snapshot while open and after visibility resumes @smoke', async ({ page, browser }, info) => {
  const browserReads: string[] = [];
  page.on('request', request => {
    if (snapshotRequest.test(request.url()) || request.resourceType() === 'eventsource') {
      browserReads.push(new URL(request.url()).pathname);
    }
  });
  await page.route(snapshotRequest, route => route.fulfill({ status: 503, json: { message: 'Browser snapshot reads are disabled' } }));
  await page.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(document, 'hidden', { get: () => hidden });
    Object.defineProperty(window, 'setAcceptanceHidden', { value: (value: boolean) => {
      hidden = value; document.dispatchEvent(new Event('visibilitychange'));
    } });
  });
  await page.clock.install({ time: new Date('2026-10-04T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-04T00:00:01Z'));
  await visit(page, '/');
  const stats = page.getByRole('region', { name: '平台数据' });
  const schools = page.getByRole('list', { name: listName });
  await expect(stats).toBeVisible();
  await expect(schools).toBeVisible();
  await expect(stats.locator('strong')).toHaveCount(3);
  const displayedStats = await stats.locator('strong').allTextContents();
  expect(displayedStats.slice(0, 2).every(value => /^\d+$/.test(value)
    && Number.isSafeInteger(Number(value)) && Number(value) >= 0)).toBe(true);
  expect(displayedStats[2]).toMatch(/^(?:\d+|正在准备首轮匹配)$/);
  expect(displayedStats).not.toContain('—');
  const initialStats = await stats.innerText();
  const initialSchools = await schools.innerText();
  await page.clock.fastForward(31 * 60_000);
  expect(await stats.innerText()).toBe(initialStats);
  expect(await schools.innerText()).toBe(initialSchools);
  expect(browserReads).toEqual([]);
  await page.evaluate(() => (window as unknown as { setAcceptanceHidden: (value: boolean) => void }).setAcceptanceHidden(true));
  await page.clock.fastForward(5 * 60_000);
  await page.evaluate(() => (window as unknown as { setAcceptanceHidden: (value: boolean) => void }).setAcceptanceHidden(false));
  await page.clock.runFor(1_000);
  expect(await stats.innerText()).toBe(initialStats);
  expect(await schools.innerText()).toBe(initialSchools);
  expect(browserReads).toEqual([]);
  await expect(page.getByText(/更新暂时失败|人数统计暂时不可用|正在加载人数统计/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('server-snapshot-without-browser-refresh.png'), fullPage: true });
  await info.attach('public-home-server-snapshot', { contentType: 'application/json', body: JSON.stringify({
    project: info.project.name, browser: browser.version(), viewport: page.viewportSize(), browserReads,
    assertions: { platformStatisticsVisible: true, schoolStatisticsVisible: true,
      noBrowserRefreshAfter31Minutes: true, noRefreshDuringHidden5Minutes: true,
      noRefreshOnVisibilityResume: true, serverSnapshotPreserved: true },
  }, null, 2) });
});

test('school discovery uses the anonymous cached endpoint @smoke', async ({ page }) => {
  const response = await page.request.get('/api/public/schools');
  expect(response.ok()).toBeTruthy();
  expect(response.headers()['cache-control']).toContain('s-maxage=');
  const payload = await response.json();
  expect(payload.schools.some((school: { domains: string[] }) => school.domains.includes('school.example.test'))).toBeTruthy();
  await visit(page, '/register/school');
  await page.getByLabel('学校邮箱', { exact: true }).fill('student@school.example.test');
  const school = payload.schools.find((item: { domains: string[] }) => item.domains.includes('school.example.test'));
  await expect(page.getByText(`✓ ${school.name}`, { exact: true })).toBeVisible();
});

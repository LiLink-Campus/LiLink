import { test, expect, api, login } from '../support/fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// Failure boundaries: writes bypass the preflight cache, or logout retains a stale session.
test('repeated browser login reuses preflight permission and logout stays fresh', async ({ page, context, account }, info) => {
  const cdp = await context.newCDPSession(page);
  const requests: Array<{ id: string; method: string; time: number }> = [];
  const responses: Array<{ id: string; status: number; maxAge: string | null }> = [];
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', event => {
    if (event.request.url === `${api}/auth/login`) {
      requests.push({ id: event.requestId, method: event.request.method, time: event.timestamp });
    }
  });
  cdp.on('Network.responseReceived', event => {
    if (requests.some(request => request.id === event.requestId)) {
      const maxAge = Object.entries(event.response.headers).find(([key]) => key.toLowerCase() === 'access-control-max-age')?.[1];
      responses.push({ id: event.requestId, status: event.response.status, maxAge: maxAge ?? null });
    }
  });
  try {
    await login(page, account);
    await page.getByRole('button', { name: /^账号菜单：/ }).click();
    await page.getByRole('menuitem', { name: '退出登录', exact: true }).click();
    await expect(page).toHaveURL(process.env.E2E_WEB_URL + '/');
    await page.goto('/dashboard/profile', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login/);
    expect((await page.request.get(`${api}/auth/me`)).status()).toBe(401);
    await new Promise(resolve => setTimeout(resolve, 7000));
    await login(page, account);
    expect((await (await page.request.get(`${api}/auth/me`)).json()).id).toBe(account.id);
    await info.attach('browser-preflight-reuse', { contentType: 'application/json',
      body: JSON.stringify({ requests, responses, logoutProtectedNavigation: true }) });
    const posts = requests.filter(request => request.method === 'POST');
    const preflights = requests.filter(request => request.method === 'OPTIONS');
    expect(posts).toHaveLength(2);
    expect(posts[1].time - posts[0].time).toBeGreaterThan(7);
    expect(preflights).toHaveLength(1);
    expect(responses.find(response => response.id === preflights[0].id)).toMatchObject({ status: 204, maxAge: '600' });
    for (const post of posts) {
      expect([200, 201]).toContain(responses.find(response => response.id === post.id)?.status);
    }
  } finally {
    await cdp.detach();
  }
});

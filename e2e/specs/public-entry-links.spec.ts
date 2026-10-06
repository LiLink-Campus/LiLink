import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import { test, expect, api, password, mailCode, visit } from '../support/fixtures';

// Failure boundaries: configured local/preview entry URLs must not turn into
// production URLs; only HTTPS apex is canonicalized, and text/HTML/share agree.
// Real disposable API processes, PostgreSQL and Mailpit exercise the boundary.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

async function freePort() {
  const server = net.createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}

test('new text, HTML and share entries honor the public Web origin @smoke', async ({ page, context, account, signedIn, browser }, info) => {
  test.setTimeout(180_000);
  void signedIn;
  const samples = [];
  const webOrigin = process.env.E2E_WEB_URL!;
  for (const variant of [
    { configured: undefined, clients: webOrigin, expected: webOrigin },
    { configured: 'https://lilink.top', clients: webOrigin, expected: 'https://www.lilink.top' },
    { configured: undefined, clients: `https://lilink.top,${webOrigin}`, expected: 'https://www.lilink.top' },
    { configured: 'https://preview.example.test', clients: webOrigin, expected: 'https://preview.example.test' },
    { configured: 'http://localhost:3000', clients: webOrigin, expected: 'http://localhost:3000' },
    { configured: 'https://api.example.test', clients: webOrigin, expected: 'https://api.example.test' },
  ]) {
    const port = await freePort();
    const child = spawn(process.execPath, ['apps/api/dist/src/main.js'], {
      cwd: process.env.E2E_WORKSPACE, stdio: 'ignore',
      env: { ...process.env, PORT: String(port), CLIENT_ORIGIN: variant.clients,
        PUBLIC_WEB_URL: variant.configured ?? '', SENTRY_DSN: '', BACKGROUND_JOBS_ENABLED: 'false' },
    });
    const childApi = `http://127.0.0.1:${port}/v1`;
    try {
      await expect.poll(async () => {
        expect(child.exitCode, 'The isolated API must remain live.').toBeNull();
        try { return (await context.request.get(`${childApi}/health`, { timeout: 1000 })).ok(); } catch { return false; }
      }, { timeout: 25_000 }).toBe(true);
      const login = await context.request.post(`${childApi}/auth/login`, { data: { email: account.email, password } });
      expect(login.ok()).toBe(true);
      const overviewResponse = await context.request.get(`${childApi}/me/referral`);
      expect(overviewResponse.ok()).toBe(true);
      const overview = await overviewResponse.json();
      expect(overview.links.length).toBeGreaterThan(0);
      for (const link of overview.links) {
        const url = new URL(link.url);
        expect(url.origin).toBe(variant.expected);
        expect(url.pathname).toBe(`/i/${overview.referralCode}`);
        expect(url.searchParams.get('ch')).toBe(link.channel);
      }
      const email = `${randomUUID()}@school.example.test`;
      const send = await context.request.post(`${childApi}/auth/request-code`, { data: { email } });
      expect(send.ok(), await send.text()).toBe(true);
      await mailCode(page, email);
      const search = await (await context.request.get(`${process.env.E2E_MAIL_URL}/api/v1/search`, { params: { query: `to:${email}` } })).json();
      const detail = await (await context.request.get(`${process.env.E2E_MAIL_URL}/api/v1/message/${search.messages[0].ID}`)).json();
      const textUrl = detail.Text.trim().split('\n').at(-1);
      const htmlUrl = detail.HTML.match(/<a href="([^"]+)"/)[1];
      expect(textUrl).toBe(variant.expected);
      expect(htmlUrl).toBe(variant.expected);
      samples.push({ configured: variant.configured ?? 'CLIENT_ORIGIN first item', expected: variant.expected,
        textAndHtmlMatch: true, sharingChannels: overview.links.map((link: { channel: string }) => link.channel) });
      if (variant.expected === webOrigin) {
        await context.clearCookies();
        await page.setContent(`<a href="${variant.expected}">邮件返回 LiLink</a>`);
        await page.getByRole('link', { name: '邮件返回 LiLink' }).click();
        await expect(page).toHaveURL(`${webOrigin}/`);
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await visit(page, `/i/${overview.referralCode}?ch=LINK&from=mail#entry`);
        await expect(page.getByRole('heading', { name: '欢迎加入 LiLink', exact: false })).toBeVisible();
        expect(new URL(page.url()).searchParams.get('from')).toBe('mail');
        expect(new URL(page.url()).hash).toBe('#entry');
        await page.getByRole('link', { name: '没有自动跳转？点此注册', exact: true }).click();
        await expect(page).toHaveURL(/\/register\/personal/);
        await expect(page.getByLabel('普通邮箱', { exact: true })).toBeVisible();
      }
    } finally {
      child.kill('SIGTERM');
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  }
  expect((await context.request.get(`${api}/auth/me`)).ok()).toBe(true);
  await info.attach('public-entry-links', { contentType: 'application/json', body: JSON.stringify({
    project: info.project.name, browser: browser.version(), samples,
    assertions: { productionApexCanonicalized: true, configFallbackAndOtherOriginsPreserved: true,
      realTextAndHtmlMailAgree: true, referralPathAndQueryPreserved: true,
      localMailClickAndInvitationRegistrationUsable: true },
  }, null, 2) });
});

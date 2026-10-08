import { spawn } from 'node:child_process';
import net from 'node:net';
import { test as baseTest, expect, api, password, completeProfile, mailCode } from '../support/fixtures';
import { randomUUID } from 'node:crypto';

const test = baseTest.extend({
  request: async ({ playwright }, use) => {
    const address = randomUUID().replaceAll('-', '').slice(0, 16).match(/.{4}/g)!.join(':');
    const request = await playwright.request.newContext({ baseURL: process.env.E2E_WEB_URL,
      extraHTTPHeaders: { 'cf-connecting-ip': `2001:db8:${address}::1` } });
    try { await use(request); } finally { await request.dispose(); }
  },
  signedIn: async ({ request, account }, use) => {
    expect((await request.post(`${api}/auth/login`, { data: { email: account.email, password } })).ok()).toBe(true);
    await use();
  },
});
// HTTP evidence is the sanitized field/status matrix, never cookie-bearing traces.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });
const privatePaths = ['/me/dashboard', '/me/bootstrap', '/me/contact-preferences', ...['home', 'profile', 'center'].map(page => `/me/page-bootstrap/${page}`)];

test('private JSON retains fields, ISO dates, null and distinct account ownership', async ({ request, playwright, db, account, signedIn }, info) => {
  void signedIn;
  const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  await db.userProfile.create({ data: { userId: account.id, headline: 'Synthetic contract headline' } });
  await db.vipActivation.create({ data: { codeHash: randomUUID(), batch: 'contract', userId: account.id, activatedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000) } });
  const second = await db.user.create({ data: { email: `${randomUUID()}@school.example.test`, passwordHash: user.passwordHash, displayName: '另一个合成账号', status: 'ACTIVE', schoolId: user.schoolId, acceptedTermsAt: new Date() } });
  const other = await playwright.request.newContext();
  try {
    expect((await other.post(`${api}/auth/login`, { data: { email: second.email, password } })).ok()).toBeTruthy();
    const summary = [];
    for (const path of privatePaths) {
      const response = await request.get(`${api}${path}`);
      expect(response.status()).toBe(200);
      const value = await response.json();
      const separate = await (await other.get(`${api}${path}`)).json();
      if (path.includes('bootstrap')) {
        expect(value.user.id).toBe(account.id);
        expect(separate.user.id).toBe(second.id);
      }
      if (path.includes('page-bootstrap')) expect(response.headers()['cache-control']).toBe('private, no-store');
      if (path === '/me/dashboard' || path === '/me/bootstrap' || path.endsWith('/home')) {
        const dashboard = path === '/me/dashboard' ? value : value.dashboard;
        expect(Object.keys(dashboard).sort()).toEqual(['profile', 'questionnaireSubmittedAt', 'currentCycle', 'lastRevealedRound', 'latestMatch', 'latestMatchVisibility', 'latestMatchLimitedReason', 'recentMatchHistory', 'couponAgenda'].sort());
        expect(dashboard).not.toHaveProperty('user');
        expect(dashboard.profile.userId).toBe(account.id);
        for (const key of ['createdAt', 'updatedAt']) expect(new Date(dashboard.profile[key]).toISOString()).toBe(dashboard.profile[key]);
        expect(dashboard.couponAgenda).toMatchObject({ href: '/dashboard/coupons', readAt: null });
      }
      if (path.endsWith('/home')) expect(value).not.toHaveProperty('questionnaire');
      if (path.endsWith('/profile')) {
        expect(value.savedQuestionnaire).toBeNull();
        expect(Object.keys(value.dashboard)).toEqual(['questionnaireSubmittedAt']);
      }
      if (path.endsWith('/profile') || path.endsWith('/center')) {
        expect(new Date(value.vip.activatedAt).toISOString()).toBe(value.vip.activatedAt);
        expect(new Date(value.vip.expiresAt).toISOString()).toBe(value.vip.expiresAt);
        expect(separate.vip.activatedAt).toBeNull();
      }
      if (path.includes('contact-preferences')) {
        expect(value).toEqual({ email: account.email, revision: 0, preferredContactChannel: 'EMAIL', methods: [] });
        expect(separate.email).toBe(second.email);
      }
      summary.push({ path, status: response.status(), keys: Object.keys(value).sort(), privateNoStore: response.headers()['cache-control'] === 'private, no-store' });
    }
    await info.attach('private-contract-field-matrix', { body: JSON.stringify(summary, null, 2), contentType: 'application/json' });
  } finally { await other.dispose(); }
});

test('admin, merchant, absent and invalid sessions cannot substitute for user identity', async ({ playwright, db, account }) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `admin-${account.email}`, passwordHash: user.passwordHash, displayName: '合成管理员' } });
  const merchant = await db.merchant.create({ data: { name: '合成商家' } });
  const operator = await db.merchantUser.create({ data: { email: `merchant-${account.email}`, passwordHash: user.passwordHash, merchantId: merchant.id, role: 'OWNER' } });
  for (const kind of ['absent', 'invalid', 'admin', 'merchant']) {
    const isolated = await playwright.request.newContext({ extraHTTPHeaders: kind === 'invalid'
      ? { cookie: 'lilink_token=invalid-synthetic-session' } : {} });
    try {
      if (kind === 'admin') expect((await isolated.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBeTruthy();
      if (kind === 'merchant') expect((await isolated.post(`${api}/merchant/auth/login`, { data: { email: operator.email, password } })).ok()).toBeTruthy();
      for (const path of privatePaths) expect((await isolated.get(`${api}${path}`)).status(), `${kind} ${path}`).toBe(401);
    } finally { await isolated.dispose(); }
  }
});

test('home summary retains eligibility and account isolation without full questionnaire data', async ({ request, playwright, db, account, signedIn }, info) => {
  void signedIn;
  const before = await request.get(`${api}/me/page-bootstrap/home`);
  expect(before.ok()).toBeTruthy();
  const incomplete = await before.json();
  expect(incomplete.user.id).toBe(account.id);
  expect(incomplete.questionnaireProgress.eligibleToOptIn).toBe(false);
  expect(incomplete.questionnaire).toBeUndefined();
  expect(incomplete.savedQuestionnaire).toBeUndefined();
  await completeProfile({ request }, db);
  const response = await request.get(`${api}/me/page-bootstrap/home`);
  expect(response.headers()['cache-control']).toContain('no-store');
  const complete = await response.json();
  expect(complete.questionnaireProgress).toMatchObject({ percent: 100, submitted: true, eligibleToOptIn: true, hasIncompleteDraft: false });
  expect(complete.contactPreferences).toBeTruthy();
  const anonymous = await playwright.request.newContext();
  try { expect((await anonymous.get(`${api}/me/page-bootstrap/home`)).status()).toBe(401); }
  finally { await anonymous.dispose(); }
});

test('activation rate limit remains enforced for one client', async ({ request, account, signedIn }) => {
  void account; void signedIn;
  for (let index = 0; index < 5; index++) {
    const response = await request.post(`${api}/me/vip/activate`, { data: { code: 'Z'.repeat(24) } });
    expect(response.status()).toBe(400);
  }
  const response = await request.post(`${api}/me/vip/activate`, { data: { code: 'Z'.repeat(24) } });
  expect(response.status()).toBe(429);
});

async function freePort() {
  const server = net.createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}

test('new text, HTML and share entries honor the public Web origin @smoke', async ({ request, account, signedIn }, info) => {
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
        try { return (await request.get(`${childApi}/health`, { timeout: 1000 })).ok(); } catch { return false; }
      }, { timeout: 25_000 }).toBe(true);
      const login = await request.post(`${childApi}/auth/login`, { data: { email: account.email, password } });
      expect(login.ok()).toBe(true);
      const overviewResponse = await request.get(`${childApi}/me/referral`);
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
      const send = await request.post(`${childApi}/auth/request-code`, { data: { email } });
      expect(send.ok(), await send.text()).toBe(true);
      await mailCode({ request: request }, email);
      const search = await (await request.get(`${process.env.E2E_MAIL_URL}/api/v1/search`, { params: { query: `to:${email}` } })).json();
      const detail = await (await request.get(`${process.env.E2E_MAIL_URL}/api/v1/message/${search.messages[0].ID}`)).json();
      const textUrl = detail.Text.trim().split('\n').at(-1);
      const htmlUrl = detail.HTML.match(/<a href="([^"]+)"/)[1];
      expect(textUrl).toBe(variant.expected);
      expect(htmlUrl).toBe(variant.expected);
      samples.push({ configured: variant.configured ?? 'CLIENT_ORIGIN first item', expected: variant.expected,
        textAndHtmlMatch: true, sharingChannels: overview.links.map((link: { channel: string }) => link.channel) });
    } finally {
      child.kill('SIGTERM');
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
      if (child.exitCode === null) child.kill('SIGKILL');
    }
  }
  expect((await request.get(`${api}/auth/me`)).ok()).toBe(true);
  await info.attach('public-entry-links', { contentType: 'application/json', body: JSON.stringify({
    project: info.project.name, samples,
    assertions: { productionApexCanonicalized: true, configFallbackAndOtherOriginsPreserved: true,
      realTextAndHtmlMailAgree: true, referralPathAndQueryPreserved: true,
      mailOriginsAndShareChannelsCorrect: true },
  }, null, 2) });
});

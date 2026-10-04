import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { APIRequestContext } from '@playwright/test';
import { test, expect, api, password } from '../support/fixtures';

// Observable failures: random metadata leaks into cached HTML; cached visits share
// a trace; dynamic SSR loses its request parent; browser requests/errors/Replay stop.
// Only the disposable runner's loopback collector enables these sampled flows.
test.skip(process.env.E2E_SENTRY_TRACING !== '1', 'Use the isolated --sentry-tracing runner.');

type Event = {
  type: string; traceId?: string; parentSpanId?: string; op?: string;
  transaction?: string; syntheticError?: boolean;
};

async function events(request: APIRequestContext): Promise<Event[]> {
  const response = await request.get(`${process.env.E2E_SENTRY_URL}/events`);
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test('cached HTML omits trace metadata and separate visits create separate traces @sentry', async ({ page, request }, info) => {
  test.setTimeout(90_000);
  const reads: { route: string; cache?: string; sha256: string }[] = [];
  for (const route of ['/', '/schools', '/about', '/faq', '/privacy', '/terms', '/one-to-one', '/merchant/login']) {
    const response = await request.get(route, { headers: { 'sentry-trace': `${randomBytes(16).toString('hex')}-${randomBytes(8).toString('hex')}-1` } });
    expect(response.ok()).toBeTruthy();
    const body = await response.body();
    expect(body.toString()).not.toMatch(/name="(?:sentry-trace|baggage)"/);
    const sha256 = createHash('sha256').update(body).digest('hex');
    const second = await request.get(route, { headers: { 'sentry-trace': `${randomBytes(16).toString('hex')}-${randomBytes(8).toString('hex')}-1` } });
    expect(createHash('sha256').update(await second.body()).digest('hex')).toBe(sha256);
    expect(second.headers()['x-nextjs-cache']).toBe('HIT');
    reads.push({ route, cache: second.headers()['x-nextjs-cache'], sha256 });
  }
  const previousIds = new Set((await events(request)).filter(event => event.op === 'pageload').map(event => event.traceId));
  const browserApiHeaders: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/api/devlog/latest') && request.headers()['sentry-trace']) {
      browserApiHeaders.push(request.headers()['sentry-trace']);
    }
  });
  for (let visit = 0; visit < 2; visit++) {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('meta[name="sentry-trace"], meta[name="baggage"]')).toHaveCount(0);
    await expect.poll(async () => new Set((await events(request))
      .filter(event => event.op === 'pageload' && event.transaction === '/' && !previousIds.has(event.traceId))
      .map(event => event.traceId)).size, { timeout: 30_000 }).toBe(visit + 1);
  }
  const traces = (await events(request)).filter(event => event.op === 'pageload' && event.transaction === '/' && !previousIds.has(event.traceId));
  expect(new Set(traces.map(event => event.traceId)).size).toBe(2);
  expect(traces.every(event => !event.parentSpanId)).toBeTruthy();
  expect(browserApiHeaders.length).toBeGreaterThanOrEqual(2);
  expect(new Set(browserApiHeaders.map(header => header.split('-')[0])).size).toBe(2);
  await info.attach('cached-html-and-independent-traces', { body: JSON.stringify({ reads, traces, browserApiHeaders }, null, 2), contentType: 'application/json' });
});

test('dynamic SSR keeps each request trace and browser continues it @sentry', async ({ page, request }, info) => {
  test.setTimeout(90_000);
  const checks: { route: string; traceId: string; meta: string }[] = [];
  for (const route of ['/login', '/register', '/register/school', '/register/personal', '/forgot-password', '/admin', '/updates', '/i/synthetic-invite', '/about/team/yoryon']) {
    const traceId = randomBytes(16).toString('hex');
    const response = await request.get(route, { headers: { 'sentry-trace': `${traceId}-${randomBytes(8).toString('hex')}-1` } });
    expect(response.ok()).toBeTruthy();
    expect(new URL(response.url()).pathname).toBe(route);
    const html = await response.text();
    const meta = html.match(/<meta name="sentry-trace" content="([^"]+)"/)?.[1];
    expect(meta, route).toMatch(new RegExp(`^${traceId}-[a-f0-9]{16}-1$`));
    expect(html).toMatch(/<meta name="baggage" content="/);
    checks.push({ route, traceId, meta: meta! });
  }
  const traceId = randomBytes(16).toString('hex');
  await page.setExtraHTTPHeaders({ 'sentry-trace': `${traceId}-${randomBytes(8).toString('hex')}-1` });
  await page.goto('/login');
  await expect(page.getByLabel('邮箱', { exact: true })).toBeVisible();
  const browserParent = (await page.locator('meta[name="sentry-trace"]').getAttribute('content'))?.split('-')[1];
  await expect.poll(async () => (await events(request)).some(event => event.op === 'pageload' && event.traceId === traceId), { timeout: 30_000 }).toBeTruthy();
  const browserTrace = (await events(request)).find(event => event.op === 'pageload' && event.traceId === traceId);
  expect(browserTrace?.parentSpanId).toBe(browserParent);
  await info.attach('dynamic-request-and-browser-traces', { body: JSON.stringify({ checks, browserTrace }, null, 2), contentType: 'application/json' });
});

test('authenticated SSR, browser errors and Replay remain enabled @sentry', async ({ page, context, request, db, signedIn }, info) => {
  test.setTimeout(90_000);
  void signedIn;
  const traceId = randomBytes(16).toString('hex');
  const checks = [];
  for (const route of ['/dashboard', '/dashboard/me', '/dashboard/profile', '/dashboard/match', '/dashboard/match/history', '/dashboard/vip', '/dashboard/coupons', '/dashboard/referrals']) {
    const response = await context.request.get(route, { headers: { 'sentry-trace': `${traceId}-${randomBytes(8).toString('hex')}-1` } });
    expect(response.ok()).toBeTruthy();
    expect(new URL(response.url()).pathname).toBe(route);
    expect(await response.text()).toMatch(new RegExp(`<meta name="sentry-trace" content="${traceId}-`));
    checks.push(route);
  }
  const retiredMeetup = await context.request.get('/dashboard/meetup/synthetic-session', {
    headers: { 'sentry-trace': `${traceId}-${randomBytes(8).toString('hex')}-1` },
  });
  expect(await retiredMeetup.text()).toMatch(new RegExp(`<meta name="sentry-trace" content="${traceId}-`));
  await page.goto('/dashboard/meetup/synthetic-session');
  await expect(page).toHaveURL(/\/dashboard\/match$/);
  const argon2 = createRequire(path.join(process.env.E2E_WORKSPACE!, 'apps/api/package.json'))('argon2');
  const merchant = await db.merchant.create({ data: { name: 'Sentry synthetic merchant' } });
  const merchantUser = await db.merchantUser.create({ data: {
    merchantId: merchant.id, email: `${randomBytes(12).toString('hex')}@merchant.example.test`,
    passwordHash: await argon2.hash(password),
  } });
  const merchantLogin = await context.request.post(`${api}/merchant/auth/login`, {
    data: { email: merchantUser.email, password },
  });
  expect(merchantLogin.ok()).toBeTruthy();
  const redemption = await context.request.get('/r/synthetic-code', {
    headers: { 'sentry-trace': `${traceId}-${randomBytes(8).toString('hex')}-1` },
  });
  expect(new URL(redemption.url()).pathname).toBe('/r/synthetic-code');
  expect(await redemption.text()).toMatch(new RegExp(`<meta name="sentry-trace" content="${traceId}-`));
  checks.push('/dashboard/meetup/synthetic-session', '/r/synthetic-code');
  await page.goto('/');
  const beforeError = (await events(request)).length;
  await page.evaluate(() => setTimeout(() => { throw new Error('LiLink synthetic Sentry cache trace probe'); }, 0));
  await expect.poll(async () => (await events(request)).slice(beforeError).some(event => event.syntheticError), { timeout: 30_000 }).toBeTruthy();
  await expect.poll(async () => (await events(request)).slice(beforeError).some(event => event.type === 'replay_event'), { timeout: 30_000 }).toBeTruthy();
  const retained = (await events(request)).slice(beforeError).filter(event => event.syntheticError || event.type === 'replay_event').map(event => ({ type: event.type, syntheticError: event.syntheticError }));
  await info.attach('authenticated-ssr-error-replay', { body: JSON.stringify({ routes: checks, retained }, null, 2), contentType: 'application/json' });
});

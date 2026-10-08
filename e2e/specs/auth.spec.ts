import { randomUUID } from 'node:crypto';
import { test, expect, api, password, visit, login, mailCode } from '../support/fixtures';

// Authentication recordings can contain passwords, cookies or mail codes.
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test('login waits for handlers, logs out and protects private navigation @smoke @mobile', async ({ page, account }) => {
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>(resolve => { releaseScripts = resolve; });
  await page.route('**/_next/static/**/*.js', async route => {
    await scriptsReady;
    await route.continue();
  });
  try {
    await page.goto('/login', { waitUntil: 'commit' });
    await expect(page.getByLabel('邮箱', { exact: true })).toBeDisabled();
    await expect(page.getByLabel('密码', { exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '登录', exact: true })).toBeDisabled();
  } finally {
    releaseScripts();
  }
  await page.getByLabel('邮箱', { exact: true }).fill(account.email);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await visit(page, '/dashboard/me');
  await expect(page.getByRole('heading', { name: '用户中心', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^账号菜单：/ }).click();
  await page.getByRole('menuitem', { name: '退出登录', exact: true }).click();
  await expect(page).toHaveURL(process.env.E2E_WEB_URL + '/');
  await page.goto('/dashboard/profile', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get(`${api}/auth/me`)).status()).toBe(401);
});

test('school registration delivers mail and creates a usable account @smoke', async ({ page }) => {
  const email = `${randomUUID()}@school.example.test`;
  const schools = await page.request.get('/api/public/schools');
  expect(schools.headers()['cache-control']).toContain('s-maxage=');
  expect((await schools.json()).schools.some((school: { domains: string[] }) => school.domains.includes('school.example.test'))).toBe(true);
  await visit(page, '/register/school');
  await page.getByLabel('学校邮箱', { exact: true }).fill(email);
  await expect(page.getByRole('status').filter({ hasText: '✓' })).toBeVisible();
  await page.getByRole('button', { name: '发送验证码', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '验证码已发送' })).toBeVisible();
  await page.getByLabel('验证码', { exact: true }).fill(await mailCode(page, email));
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.getByLabel('确认密码', { exact: true }).fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '创建账号', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  expect((await (await page.request.get(`${api}/auth/me`)).json()).email).toBe(email);
  await page.context().clearCookies();
  await login(page, { id: '', email, displayName: '' });
  const received = await (await page.request.get(`${process.env.E2E_MAIL_URL}/api/v1/search`, { params: { query: `to:${email}` } })).json();
  const mail = await (await page.request.get(`${process.env.E2E_MAIL_URL}/api/v1/message/${received.messages[0].ID}`)).json();
  const actualHref = mail.HTML.match(/<a href="([^"]+)"/)?.[1];
  expect(actualHref).toBe(process.env.E2E_WEB_URL);
  await page.setContent(mail.HTML);
  await page.locator(`a[href="${actualHref}"]`).click();
  await expect(page).toHaveURL(process.env.E2E_WEB_URL + '/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

// Failure boundary: a directly opened personal registration page must not
// accept input before handlers can retain it; the ready form must register.
test('personal registration waits for handlers and creates a usable account @smoke', async ({ page, account, db }, info) => {
  const email = `${randomUUID()}@personal.example.test`;
  const referralCode = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
  const school = await db.school.findUniqueOrThrow({ where: { slug: 'e2e-school' } });
  await db.user.update({ where: { id: account.id }, data: { referralCode } });
  await visit(page, `/i/${referralCode}?ch=LINK&from=mail#entry`);
  expect(new URL(page.url()).searchParams.get('from')).toBe('mail');
  expect(new URL(page.url()).hash).toBe('#entry');
  await page.getByRole('link', { name: '没有自动跳转？点此注册', exact: true }).click();
  await expect(page).toHaveURL(/\/register\/personal/);
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>(resolve => { releaseScripts = resolve; });
  await page.route('**/_next/static/**/*.js', async route => {
    await scriptsReady;
    await route.continue();
  });
  try {
    await page.goto('/register/personal', { waitUntil: 'commit' });
    for (const label of ['邀请码', '普通邮箱', '验证码']) {
      await expect(page.getByLabel(label, { exact: true })).toBeDisabled();
    }
    await expect(page.getByRole('button', { name: '发送验证码', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '下一步', exact: true })).toBeDisabled();
    releaseScripts();
    const invitedCode = page.getByRole('textbox', { name: /^邀请码/ });
    await expect(invitedCode).toBeEnabled();
    await expect(invitedCode).toHaveValue(referralCode);
    await expect(invitedCode).toHaveAttribute('readonly', '');
    await page.getByLabel('普通邮箱', { exact: true }).fill(email);
    await page.getByRole('button', { name: '发送验证码', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '验证码已发送' })).toBeVisible();
    await expect(page.getByLabel('普通邮箱', { exact: true })).toHaveValue(email);
    await page.getByLabel('验证码', { exact: true }).fill(await mailCode(page, email));
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByRole('combobox', { name: /^学校 / }).selectOption(school.id);
    await page.getByLabel('密码', { exact: true }).fill(password);
    await page.getByLabel('确认密码', { exact: true }).fill(password);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: '创建账号', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    expect((await (await page.request.get(`${api}/auth/me`)).json()).email).toBe(email);
    const registered = await db.user.findUniqueOrThrow({ where: { email } });
    expect(registered.referredByUserId).toBe(account.id);
    expect(registered.schoolId).toBe(school.id);
    await page.context().clearCookies();
    await login(page, { id: registered.id, email, displayName: '' });
    await info.attach('personal-registration-ready', { contentType: 'application/json', body: JSON.stringify({
      project: info.project.name, assertions: { inputsUnavailableBeforeHandlers: true,
        emailRetainedThroughMailDelivery: true, registrationCompleted: true,
        schoolAndReferrerPersisted: true, createdAccountCanLogin: true },
    }) });

  } finally {
    releaseScripts();
    if (!page.isClosed()) await page.unrouteAll({ behavior: 'wait' });
  }
});

test('password reset waits for its handlers before accepting input @smoke', async ({ page, account }, testInfo) => {
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>(resolve => { releaseScripts = resolve; });
  await page.route('**/_next/static/**/*.js', async route => {
    await scriptsReady;
    await route.continue();
  });
  try {
    await page.goto('/forgot-password', { waitUntil: 'commit' });
    await expect(page.getByLabel('注册邮箱', { exact: true })).toBeDisabled();
    await expect(page.getByLabel('验证码', { exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '发送验证码', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: '下一步', exact: true })).toBeDisabled();
  } finally {
    releaseScripts();
  }
  await page.getByLabel('注册邮箱', { exact: true }).fill(account.email);
  await page.getByRole('button', { name: '发送验证码', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '验证码已发送' })).toBeVisible();
  expect(await mailCode(page, account.email)).toMatch(/^\d{6}$/);

});

test('password reset revokes a second browser session and keeps the replacement session usable', async ({
  page,
  account,
  browser,
}, testInfo) => {
  const newPassword = 'ReplacementE2e456!';
  const previousContext = await browser.newContext({
    baseURL: process.env.E2E_WEB_URL,
    viewport: page.viewportSize(),
    locale: 'zh-CN',
    reducedMotion: 'reduce',
    extraHTTPHeaders: { 'cf-connecting-ip': '2001:db8:139::1' },
  });
  const previousPage = await previousContext.newPage();
  try {
    await login(previousPage, account);
    await login(page, account);
    const before = await (await previousPage.request.get(`${api}/auth/me`)).json();
    expect(before).not.toHaveProperty('sessionVersion');
    await visit(page, '/forgot-password');
    await expect(page.getByLabel('注册邮箱', { exact: true })).toHaveValue(account.email);
    await page.getByRole('button', { name: '发送验证码', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '验证码已发送' })).toBeVisible();
    await page.getByLabel('验证码', { exact: true }).fill(await mailCode(page, account.email));
    await page.getByRole('button', { name: '下一步', exact: true }).click();
    await page.getByLabel('新密码', { exact: true }).fill(newPassword);
    await page.getByLabel('确认新密码', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: '重置密码', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    expect((await previousPage.request.get(`${api}/auth/me`)).status()).toBe(401);
    expect(
      (await previousPage.request.put(`${api}/me/locale`, { data: { locale: 'en-US' } })).status()
    ).toBe(401);
    const after = await (await page.request.get(`${api}/auth/me`)).json();
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    expect(after).not.toHaveProperty('sessionVersion');
    expect(
      (await page.request.put(`${api}/me/locale`, { data: { locale: 'zh-CN' } })).status()
    ).toBe(200);
    await previousPage.goto('/dashboard/me', { waitUntil: 'domcontentloaded' });
    await expect(previousPage).toHaveURL(/\/login/);
    await expect(previousPage.getByRole('button', { name: '登录', exact: true })).toBeVisible();
    await expect(previousPage.getByLabel('邮箱', { exact: true })).toBeEnabled();
    await expect(previousPage.locator('main .animate-in')).toHaveCSS('opacity', '1');

    await page.context().clearCookies();
    const oldLogin = await page.request.post(`${api}/auth/login`, {
      data: { email: account.email, password },
    });
    expect(oldLogin.status()).toBe(401);
    await login(page, account, newPassword);
    await testInfo.attach('session-revocation-assertions', {
      body: JSON.stringify({
        project: testInfo.project.name,
        independentBrowserContexts: 2,
        assertions: {
          previousCookieRead401: true,
          previousCookieWrite401: true,
          previousPageReturnsToLogin: true,
          replacementCookieReadWrite: true,
          authMeShapePreserved: true,
          oldPasswordRejected: true,
          newPasswordLogin: true,
        },
      }),
      contentType: 'application/json',
    });
  } finally {
    await previousContext.close();
  }
});

test('first school read times out and manual retry recovers', async ({ page }, info) => {
  await page.clock.install();
  let release!: () => void;
  const stalled = new Promise<void>(resolve => { release = resolve; });
  let attempts = 0;
  await page.route('**/api/public/schools', async route => {
    if (++attempts === 1) { await stalled; await route.abort(); }
    else await route.continue();
  });
  try {
    await visit(page, '/register/school');
    await page.getByLabel('学校邮箱', { exact: true }).fill('deadline@school.example.test');
    await expect.poll(() => attempts).toBe(1);
    await page.clock.fastForward(15_100);
    await expect(page.getByText('暂时无法核对邮箱后缀', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '重试加载学校列表', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '✓' })).toBeVisible();
    expect(attempts).toBe(2);

  } finally { release(); }
});

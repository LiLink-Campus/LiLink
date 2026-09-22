import { randomUUID } from 'node:crypto';
import { test, expect, api, password, visit, login, mailCode } from '../support/fixtures';

test('login waits for its handlers before accepting input @smoke', async ({ page, account }) => {
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
});

test('login, logout, and protected route @smoke', async ({ page, account }) => {
  await login(page, account);
  await visit(page, '/dashboard/me');
  await expect(page.getByRole('heading', { name: '用户中心', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /^账号菜单：/ }).click();
  await page.getByRole('menuitem', { name: '退出登录', exact: true }).click();
  await expect(page).toHaveURL(process.env.E2E_WEB_URL + '/');
  await page.goto('/dashboard/profile', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/login/);
  expect((await page.request.get(`${api}/auth/me`)).status()).toBe(401);
});

test('login respects reduced motion while focusing form fields @smoke', async ({ page, account }, testInfo) => {
  await visit(page, '/login');
  await expect(page.locator('html')).toHaveCSS('scroll-behavior', 'auto');
  await page.getByLabel('邮箱', { exact: true }).fill(account.email);
  await page.getByLabel('密码', { exact: true }).fill(password);
  await page.screenshot({ path: testInfo.outputPath('login-reduced-motion.png'), fullPage: true });
  const response = page.waitForResponse(response => response.url() === `${api}/auth/login` && response.request().method() === 'POST');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  expect((await response).ok()).toBeTruthy();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole('button', { name: /^账号菜单：/ })).toBeVisible();
});

test('school registration delivers mail and creates a usable account @smoke', async ({ page }) => {
  const email = `${randomUUID()}@school.example.test`;
  await visit(page, '/register/school');
  await page.getByLabel('学校邮箱', { exact: true }).fill(email);
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
  await testInfo.attach('password-reset-email', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});

test('password reset mail invalidates old password', async ({ page, account }, testInfo) => {
  const newPassword = 'ReplacementE2e456!';
  await visit(page, '/forgot-password');
  await page.getByLabel('注册邮箱', { exact: true }).fill(account.email);
  await page.getByRole('button', { name: '发送验证码', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '验证码已发送' })).toBeVisible();
  await page.getByLabel('验证码', { exact: true }).fill(await mailCode(page, account.email));
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByLabel('新密码', { exact: true }).fill(newPassword);
  await page.getByLabel('确认新密码', { exact: true }).fill(newPassword);
  await testInfo.attach('password-reset-new-password', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  await page.getByRole('button', { name: '重置密码', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.context().clearCookies();
  const oldLogin = await page.request.post(`${api}/auth/login`, { data: { email: account.email, password } });
  expect(oldLogin.status()).toBe(401);
  await login(page, account, newPassword);
});

import { test, expect, api, visit, completeProfile } from '../support/fixtures';

test.beforeEach(async ({ signedIn }) => { void signedIn; });

async function openContact(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '下一题 →', exact: true }).click();
  await page.getByRole('button', { name: '下一题 →', exact: true }).click();
  await expect(page.getByRole('radiogroup', { name: '向对方展示的联系方式' })).toBeVisible();
}

test('a reused email cannot restore another account contact draft', async ({ page, context, db }, testInfo) => {
  await completeProfile(context, db);
  const user = await (await context.request.get(`${api}/auth/me`)).json();
  await visit(page, '/dashboard');
  await page.evaluate(({ email }) => {
    const draft = JSON.stringify({ revision: 0, preferredContactChannel: 'WECHAT', methods: [{ type: 'WECHAT', value: 'retired_account_private_contact' }] });
    sessionStorage.setItem(`lilink:contact-draft:${email}`, draft);
    sessionStorage.setItem('lilink:contact-draft:v2:retired-account-id', draft);
  }, { email: user.email });
  await visit(page, '/dashboard/profile');
  await openContact(page);
  await expect(page.getByRole('radio', { name: '邮箱', exact: true })).toBeChecked();
  const contact = page.getByRole('region', { name: '联系方式', exact: true });
  await expect(contact.getByText('已自动保存 · 匹配成功后向对方展示', { exact: true })).toBeVisible();

  const contacts = await (await context.request.get(`${api}/me/contact-preferences`)).json();
  expect(contacts).toMatchObject({ preferredContactChannel: 'EMAIL', revision: 0, methods: [] });
});

test('failed contact save blocks navigation, preserves draft across reload and retries', async ({ page, context, db }, testInfo) => {
  await completeProfile(context, db);
  await visit(page, '/dashboard/profile');
  await openContact(page);
  await page.route('**/v1/me/contact-preferences', route => route.request().method() === 'PUT'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '测试保存失败，请重试' }) })
    : route.continue());
  await page.getByRole('radio', { name: '微信', exact: true }).check();
  const input = page.getByRole('textbox', { name: '微信内容', exact: true });
  await input.fill('retained_contact_draft');
  await page.getByRole('link', { name: '首页', exact: true }).first().click();
  await expect(page.getByRole('button', { name: '重试保存', exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/profile$/);
  await expect(input).toHaveValue('retained_contact_draft');
  await page.getByRole('button', { name: '重试保存', exact: true }).scrollIntoViewIfNeeded();

  page.on('dialog', dialog => dialog.accept());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openContact(page);
  await expect(input).toHaveValue('retained_contact_draft');
  await expect(page.getByRole('button', { name: '重试保存', exact: true })).toBeVisible();
  await page.unroute('**/v1/me/contact-preferences');
  await page.getByRole('button', { name: '重试保存', exact: true }).click();
  await expect(page.getByText('已自动保存 · 匹配成功后向对方展示', { exact: true })).toBeVisible();
  await page.getByText('已自动保存 · 匹配成功后向对方展示', { exact: true }).scrollIntoViewIfNeeded();

  const result = await (await context.request.get(`${api}/me/contact-preferences`)).json();
  expect(result.methods.find((method: { type: string }) => method.type === 'WECHAT').value).toBe('retained_contact_draft');
  await input.fill('saved_before_navigation');
  await page.getByRole('link', { name: '首页', exact: true }).first().click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await visit(page, '/dashboard/profile');
  await openContact(page);
  await expect(input).toHaveValue('saved_before_navigation');
});

test('invalid contact save response keeps draft and can retry with server revision', async ({ page, context, db, signedIn }, info) => {
  void signedIn;
  await completeProfile(context, db);
  await visit(page, '/dashboard/profile');
  await page.getByRole('button', { name: '下一题 →', exact: true }).click();
  await page.getByRole('button', { name: '下一题 →', exact: true }).click();
  await page.route('**/v1/me/contact-preferences', async route => {
    const response = await route.fetch();
    if (route.request().method() === 'PUT') await route.fulfill({ response, json: { ...(await response.json()), revision: 'invalid' } });
    else await route.fulfill({ response });
  });
  await page.getByRole('radio', { name: '微信', exact: true }).check();
  const input = page.getByRole('textbox', { name: '微信内容', exact: true });
  await input.fill('synthetic_contract_contact');
  await expect(page.getByRole('button', { name: '重试保存', exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '服务返回的数据格式异常，请重试。' })).toBeVisible();
  await expect(input).toHaveValue('synthetic_contract_contact');

  await page.unroute('**/v1/me/contact-preferences');
  await page.getByRole('button', { name: '重试保存', exact: true }).click();
  await expect(page.getByText('已自动保存 · 匹配成功后向对方展示', { exact: true })).toBeVisible();
  expect((await (await context.request.get(`${api}/me/contact-preferences`)).json()).revision).toBe(2);
});

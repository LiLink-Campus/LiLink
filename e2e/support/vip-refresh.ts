import type { BrowserContext, Page } from '@playwright/test';
import { api, expect } from './fixtures';

export const vipActive = { active: true, activatedAt: '2026-01-01T00:00:00.000Z', expiresAt: '2030-01-01T00:00:00.000Z',
  durationDays: 30, priceYuan: '29.90', advancedFiltersAvailable: true };
export const vipInactive = { ...vipActive, active: false, activatedAt: null, expiresAt: null };
export const vipPages = [
  { endpoint: 'profile', path: '/dashboard/profile#profile-attention-hard_partner_height_min' },
  { endpoint: 'center', path: '/dashboard/me' },
] as const;

export async function setVipBootstrap(context: BrowserContext, endpoint: string, mode: 'vip-null' | 'off') {
  const cookie = (await context.cookies(api)).filter(item => item.name === 'lilink_token')
    .map(item => `${item.name}=${item.value}`).join('; ');
  expect(cookie).not.toBe('');
  const response = await context.request.post(`${process.env.E2E_CONTRACT_PROXY_URL}/__e2e_contract`, {
    data: { cookie, path: `/v1/me/page-bootstrap/${endpoint}`, mode },
  });
  expect(response.status()).toBe(204);
}

export async function visibility(page: Page, hidden: boolean) {
  await page.evaluate(value => {
    Object.defineProperty(document, 'hidden', { configurable: true, value });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

export async function focus(page: Page, count = 1) {
  await page.evaluate(times => {
    for (let n = 0; n < times; n++) window.dispatchEvent(new Event('focus'));
  }, count);
}

export async function readyCenter(page: Page) {
  // SSR membership is visible before the center's client effects are installed.
  const menu = page.getByRole('button', { name: /^账号菜单：/ });
  await menu.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await menu.click();
  await expect(page.getByRole('menu')).toHaveCount(0);
}

export async function vipScreenshot(page: Page) {
  return page.screenshot({ mask: [page.getByRole('region', { name: '账号信息' }).locator('p')] });
}

export async function expectVip(page: Page, endpoint: string, active: boolean) {
  if (endpoint === 'center') {
    await expect(page.getByLabel('VIP 会员', { exact: true })).toHaveCount(active ? 1 : 0);
    if (active) await expect(page.getByRole('main').getByText('已开通', { exact: true })).toBeVisible();
  } else {
    await expect(page.getByRole('main').getByText(active
      ? '高级筛选 · VIP 已启用' : '高级筛选 · 需要 VIP，开通后可设置', { exact: true }).filter({ visible: true })).toBeVisible();
  }
}

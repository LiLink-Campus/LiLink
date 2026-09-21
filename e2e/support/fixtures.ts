import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { assertTestDatabase } from '../../scripts/e2e/environment.mjs';

assertTestDatabase(process.env.DATABASE_URL!);
const require = createRequire(path.join(process.env.E2E_WORKSPACE!, 'apps/api/package.json'));
const { createPrismaClient } = require('./dist/src/common/prisma/client.js');
const argon2 = require('argon2');
export const api = process.env.E2E_API_URL!;
export const password = 'SyntheticE2e123!';
export type Account = { id: string; email: string; displayName: string };

export const test = base.extend<{
  db: ReturnType<typeof createPrismaClient>;
  account: Account;
  signedIn: void;
}>({
  context: async ({ context }, use, info) => {
    const clientId = createHash('sha256').update(`${info.testId}:${info.repeatEachIndex}:${info.retry}`).digest('hex').slice(0, 16);
    await context.setExtraHTTPHeaders({ 'cf-connecting-ip': `2001:db8:${clientId.match(/.{4}/g)!.join(':')}::1` });
    await use(context);
  },
  db: async ({}, use: (db: any) => Promise<void>) => {
    const db = createPrismaClient();
    try { await use(db); } finally { await db.$disconnect(); }
  },
  account: async ({ db }, use) => {
    const school = await db.school.findUniqueOrThrow({ where: { slug: 'e2e-school' } });
    const account = await db.user.create({ data: {
      email: `${randomUUID()}@school.example.test`, passwordHash: await argon2.hash(password),
      displayName: '自动化同学', status: 'ACTIVE', schoolId: school.id, acceptedTermsAt: new Date(),
    } });
    await use(account);
    // The runner destroys only this run's containers, including all related rows.
  },
  signedIn: async ({ context, account }, use) => {
    const response = await context.request.post(`${api}/auth/login`, { data: { email: account.email, password } });
    expect(response.ok(), await response.text()).toBeTruthy();
    await use();
  },
});
export { expect };

export async function visit(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
}
export async function login(page: Page, account: Account, secret = password) {
  await visit(page, '/login');
  await page.getByLabel('邮箱', { exact: true }).fill(account.email);
  await page.getByLabel('密码', { exact: true }).fill(secret);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}
export async function completeProfile(context: BrowserContext, db: any) {
  const version = await db.questionnaireVersion.findFirstOrThrow({ where: { isCurrent: true }, include: { questions: true }, orderBy: { createdAt: 'desc' } });
  const answers = Object.fromEntries(version.questions.map((q: any) => [q.key, q.type === 'MULTI_SELECT' ? q.options.slice(0, q.selectionLimit ?? 1).map((option: any) => option.value) : q.options[0].value]));
  const response = await context.request.put(`${api}/me/questionnaire`, { data: {
    versionId: version.id, displayName: '自动化同学', answers,
    hardMatchForm: {
      birthYear: '2000', birthMonth: '1', birthDay: '1', gender: '女', partnerGenders: ['男', '女'],
      partnerAgeMin: '18', partnerAgeMax: '40', nationality: '中国', languages: ['中文'],
      partnerNationalities: [], partnerLanguages: [], looks: '5', partnerLooks: ['1','2','3','4','5','6','7','8','9','10'],
      heightCm: '165', weightKg: '55', partnerHeightMin: '120', partnerHeightMax: '230',
      partnerWeightMin: '30', partnerWeightMax: '300', oneLinerIntro: '喜欢一起散步和读书。',
      excludedPartnerSchools: [], excludedPartnerSchoolGenders: [],
    },
  } });
  expect(response.ok(), await response.text()).toBeTruthy();
  expect((await response.json()).saveState).toBe('SUBMITTED');
}
export async function mailCode(page: Page, email: string) {
  let code = '';
  await expect.poll(async () => {
    const response = await page.request.get(`${process.env.E2E_MAIL_URL}/api/v1/search`, { params: { query: `to:${email}` } });
    const result = await response.json();
    for (const message of result.messages ?? []) {
      const detail = await (await page.request.get(`${process.env.E2E_MAIL_URL}/api/v1/message/${message.ID}`)).json();
      code = (detail.Text ?? '').match(/(?<!\d)\d{6}(?!\d)/)?.[0] ?? '';
      if (code) return true;
    }
    return false;
  }, { timeout: 40_000, intervals: [250, 500, 1000] }).toBeTruthy();
  return code;
}
export async function vipCode(db: any) {
  const code = randomUUID().replaceAll('-', '').slice(0, 24).toUpperCase();
  await db.vipActivation.create({ data: { codeHash: createHash('sha256').update(code).digest('hex'), batch: 'e2e' } });
  return code;
}

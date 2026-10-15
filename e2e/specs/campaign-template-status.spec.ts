import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test, expect, api, password, visit } from '../support/fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

test('coupon toggles work until campaign ends, then all templates stay disabled @webkit @mobile', async ({ page, context, db, account }, info) => {
  const source = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `campaign-${account.email}`, passwordHash: source.passwordHash } });
  expect((await context.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBe(true);
  const merchant = await db.merchant.create({ data: { name: '合成启停商家' } });
  const campaign = await db.campaign.create({ data: { name: `启停验收-${account.id}`, slug: `toggle-${account.id}` } });
  const template = await db.couponTemplate.create({ data: { merchantId: merchant.id, campaignId: campaign.id, title: '合成启停券', benefitText: "合成优惠，由店员现场确认。" } });
  const other = await db.couponTemplate.create({ data: { merchantId: merchant.id, campaignId: campaign.id, title: '合成第二张券', benefitText: "合成优惠，由店员现场确认。" } });
  const endpoint = `${api}/admin/coupon-templates/${template.id}`;
  const patch = (data: object) => context.request.patch(endpoint, { data });
  expect((await patch({ isActive: false })).ok()).toBe(true);
  expect((await patch({ isActive: true })).ok()).toBe(true);
  const priorActive = await db.campaign.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
  try {
    await db.campaign.updateMany({ where: { status: 'ACTIVE' }, data: { status: 'ENDED' } });
    expect((await context.request.patch(`${api}/admin/campaigns/${campaign.id}`, { data: { status: 'ACTIVE' } })).ok()).toBe(true);
    await visit(page, '/admin/campaigns');
    await page.getByText(campaign.name, { exact: true }).last().click();
    const row = page.locator('div').filter({ has: page.getByText(template.title, { exact: true }) }).filter({ has: page.getByRole('button', { name: '停用', exact: true }) }).last();
    await row.getByRole('button', { name: '停用', exact: true }).click();
    await expect.poll(async () => (await db.couponTemplate.findUniqueOrThrow({ where: { id: template.id } })).isActive).toBe(false);
    await page.reload();
    await page.getByText(campaign.name, { exact: true }).last().click();
    await page.getByRole('button', { name: '启用', exact: true }).click();
    await expect.poll(async () => (await db.couponTemplate.findUniqueOrThrow({ where: { id: template.id } })).isActive).toBe(true);
    expect((await patch({ title: '禁止改券面' })).status()).toBe(400);
    expect((await patch({ isActive: false, faceValue: 1 })).status()).toBe(400);
    await page.screenshot({ path: info.outputPath('active-coupons.png'), fullPage: true });
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '结束活动', exact: true }).click();
    await expect.poll(async () => (await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe('ENDED');
    await page.reload();
    await page.getByText(campaign.name, { exact: true }).last().click();
    await expect(page.getByRole('button', { name: '启用', exact: true })).toHaveCount(2);
    for (const button of await page.getByRole('button', { name: '启用', exact: true }).all()) await expect(button).toBeDisabled();
    expect(await db.couponTemplate.count({ where: { campaignId: campaign.id, isActive: true } })).toBe(0);
    for (const isActive of [true, false]) expect((await patch({ isActive })).status()).toBe(400);
    expect((await context.request.post(`${api}/admin/campaigns/${campaign.id}/templates`, { data: { merchantId: merchant.id, title: '禁止新增', benefitText: "合成优惠，由店员现场确认。" } })).status()).toBe(400);
    expect((await context.request.patch(`${api}/admin/campaigns/${campaign.id}`, { data: { status: 'ACTIVE' } })).status()).toBe(400);
    await page.screenshot({ path: info.outputPath('ended-coupons.png'), fullPage: true });
    // Both operations share the same lock: ending wins regardless of acquisition order.
    const racing = await db.campaign.create({ data: { name: '并发合成活动', slug: `race-${account.id}`, status: 'ACTIVE' } });
    await db.couponTemplate.update({ where: { id: other.id }, data: { campaignId: racing.id, isActive: false } });
    const responses = await Promise.all([
      context.request.patch(`${api}/admin/campaigns/${racing.id}`, { data: { status: 'ENDED' } }),
      context.request.patch(`${api}/admin/coupon-templates/${other.id}`, { data: { isActive: true } }),
    ]);
    expect(responses[0].ok()).toBe(true);
    expect([200, 400]).toContain(responses[1].status());
    expect((await db.couponTemplate.findUniqueOrThrow({ where: { id: other.id } })).isActive).toBe(false);
  } finally {
    for (const prior of priorActive) await db.campaign.update({ where: { id: prior.id }, data: { status: 'ACTIVE' } });
  }
});


test('ended-template migration disables only ended campaigns', async ({ db }, info) => {
  const schema = `campaign_migration_${randomUUID().replaceAll('-', '')}`;
  const sql = await readFile('apps/api/prisma/migrations/20261016020000_disable_ended_campaign_templates/migration.sql', 'utf8');
  await db.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
    await tx.$executeRawUnsafe('CREATE TABLE "Campaign" (id text PRIMARY KEY, status text)');
    await tx.$executeRawUnsafe('CREATE TABLE "CouponTemplate" (id text PRIMARY KEY, "campaignId" text, "isActive" boolean, "updatedAt" timestamp)');
    await tx.$executeRawUnsafe(`INSERT INTO "Campaign" VALUES ('ended', 'ENDED'), ('active', 'ACTIVE'), ('draft', 'DRAFT')`);
    await tx.$executeRawUnsafe(`INSERT INTO "CouponTemplate" VALUES ('a', 'ended', true, CURRENT_TIMESTAMP), ('b', 'ended', false, CURRENT_TIMESTAMP), ('c', 'active', true, CURRENT_TIMESTAMP), ('d', 'draft', true, CURRENT_TIMESTAMP)`);
    await tx.$executeRawUnsafe(sql);
    await tx.$executeRawUnsafe(sql);
    expect(await tx.$queryRawUnsafe('SELECT id, "isActive" FROM "CouponTemplate" ORDER BY id')).toEqual([
      { id: 'a', isActive: false }, { id: 'b', isActive: false }, { id: 'c', isActive: true }, { id: 'd', isActive: true },
    ]);
    await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  });
  await info.attach('migration-assertions', { contentType: 'application/json', body: JSON.stringify({ endedDisabled: true, activeAndDraftPreserved: true, repeatable: true }) });
});

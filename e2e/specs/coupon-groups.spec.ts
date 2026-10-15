import { generateHumanCode, generateTotpSecret, generateTotpToken, COUPON_CODE_LENGTH } from '@lilink/shared';
import { test, expect, api, password, visit } from '../support/fixtures';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// Failure contracts: invalid credentials/expiry never consume a group; two scans
// can consume only one member; other users, groups and merchants stay independent.
test('text coupons use a group once with direct scan redemption @webkit @mobile', async ({ page, context, db, account, signedIn }, info) => {
  void signedIn;
  const source = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({ data: { email: `text-${account.email}`, passwordHash: source.passwordHash } });
  expect((await context.request.post(`${api}/admin-session/login`, { data: { email: admin.email, password } })).ok()).toBe(true);
  const merchant = await db.merchant.create({ data: { name: '合成任选商家' } });
  const operator = await db.merchantUser.create({ data: { merchantId: merchant.id, email: `text-merchant-${account.email}`, passwordHash: source.passwordHash } });
  const campaign = await db.campaign.create({ data: { name: `文字券验收-${account.id}`, slug: `text-${account.id}` } });
  await visit(page, '/admin/campaigns');
  await page.getByText(campaign.name, { exact: true }).last().click();
  await page.getByLabel('合作商家', { exact: true }).selectOption(merchant.id);
  await page.getByLabel('券标题', { exact: true }).fill('满50减5');
  await page.getByLabel('优惠内容', { exact: true }).fill('消费满50元减5元，店员现场确认。\n限堂食，不与其他优惠同享。本店满减优惠每人限选一张。');
  await expect(page.getByLabel('使用说明', { exact: true })).toHaveCount(0);
  await page.getByLabel('互斥组', { exact: true }).fill('满减任选');
  await page.screenshot({ path: info.outputPath('admin-text-coupon.png'), fullPage: true });
  await page.getByRole('button', { name: '添加优惠券', exact: true }).click();
  await expect(page.getByText('满50减5', { exact: true })).toBeVisible();
  const templates = [await db.couponTemplate.findFirstOrThrow({ where: { campaignId: campaign.id } })];
  for (const [title, benefitText] of [['满100减15', '消费满100元减15元。'], ['满200减40', '消费满200元减40元。']]) {
    const response = await context.request.post(`${api}/admin/campaigns/${campaign.id}/templates`, { data: { merchantId: merchant.id, title, benefitText, redemptionGroupName: '满减任选' } });
    expect(response.ok(), await response.text()).toBe(true);
    templates.push(await response.json());
  }
  expect(new Set(templates.map(t => t.redemptionGroupId)).size).toBe(1);
  expect(templates[0]).not.toHaveProperty('usageNotes');
  expect((await context.request.patch(`${api}/admin/coupon-templates/${templates[0].id}`, { data: { usageNotes: '已删除字段' } })).status()).toBe(400);
  const coupons: any[] = [];
  async function issue(templateId: string, userId = account.id, expiresAt: Date | null = null) {
    return db.coupon.create({ data: { templateId, userId, code: generateHumanCode({ length: COUPON_CODE_LENGTH }), totpSecret: generateTotpSecret(), expiresAt } });
  }
  for (const template of templates) coupons.push(await issue(template.id));
  expect((await context.request.patch(`${api}/admin/coupon-templates/${templates[0].id}`, { data: { benefitText: null } })).status()).toBe(400);
  expect((await context.request.patch(`${api}/admin/coupon-templates/${templates[0].id}`, { data: { redemptionGroupName: '不能修改已发券的分组' } })).status()).toBe(400);
  expect((await context.request.post(`${api}/admin/campaigns/${campaign.id}/templates`, { data: { merchantId: merchant.id, title: '非法组', benefitText: '测试', redemptionGroupId: templates[0].redemptionGroupId } })).status()).toBe(400);

  await visit(page, '/dashboard/coupons');
  await expect(page.getByText(/同组任选一张/)).toHaveCount(0);
  await expect(page.getByText('满减任选', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '可用优惠券', exact: true }).getByRole('article', { name: templates[0].title, exact: true }).getByText(/本店满减优惠每人限选一张/)).toBeVisible();
  const overview = await (await context.request.get(`${api}/me/coupons/overview`)).json();
  for (const item of overview.available.items) expect(item).not.toHaveProperty('redemptionGroupName');
  await page.screenshot({ path: info.outputPath('available-group.png'), fullPage: true });
  expect((await context.request.post(`${api}/merchant/auth/login`, { data: { email: operator.email, password } })).ok()).toBe(true);
  const redeem = (coupon: any, totp = generateTotpToken(coupon.totpSecret)) => context.request.post(`${api}/merchant/redeem`, { data: { code: coupon.code, totp } });
  const wrongToken = generateTotpToken(coupons[0].totpSecret, Date.now() - 3600000);
  expect((await (await redeem(coupons[0], wrongToken)).json()).result).toBe('EXPIRED_CODE');
  expect(await db.couponGroupRedemption.count({ where: { userId: account.id } })).toBe(0);
  await page.getByRole('article', { name: templates[0].title, exact: true }).getByRole('button', { name: '查看核销码', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('请向店员出示此核销码')).toBeVisible();
  const scanPage = await context.newPage();
  await visit(scanPage, `/r/${coupons[1].code}#t=${generateTotpToken(coupons[1].totpSecret)}`);
  await expect(scanPage.getByText('核销成功', { exact: true })).toBeVisible();
  await expect(scanPage.getByPlaceholder('消费金额（元）')).toHaveCount(0);
  await expect(scanPage.getByRole('button', { name: '确认核销', exact: true })).toHaveCount(0);
  await scanPage.screenshot({ path: info.outputPath('scan-success.png'), fullPage: true });
  await scanPage.close();
  expect(await db.redemption.count({ where: { userId: account.id } })).toBe(1);
  expect(await db.couponGroupRedemption.count({ where: { userId: account.id } })).toBe(1);
  expect(await db.coupon.count({ where: { userId: account.id, status: 'VOID', voidReason: 'GROUP_USED' } })).toBe(2);
  expect((await (await redeem(coupons[0])).json()).result).toBe('GROUP_USED');
  expect((await (await redeem(coupons[1])).json()).result).toBe('ALREADY_USED');
  await expect(page.getByRole('dialog').getByText('已使用同组其他优惠', { exact: true })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByRole('region', { name: '历史记录' }).getByRole('article', { name: templates[1].title, exact: true }).getByText('已使用', { exact: true })).toBeVisible();
  await expect(page.getByText('已使用同组其他优惠', { exact: true })).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('used-group.png'), fullPage: true });
  const peer = await db.user.create({ data: { email: `group-peer-${account.email}`, passwordHash: source.passwordHash, status: 'ACTIVE' } });
  const peerCoupons = await Promise.all(templates.slice(0, 2).map(t => issue(t.id, peer.id)));
  const race = await Promise.all(peerCoupons.map(c => redeem(c).then(r => r.json())));
  expect(race.map(r => r.result).sort()).toEqual(['GROUP_USED', 'SUCCESS']);
  expect(await db.redemption.count({ where: { userId: peer.id } })).toBe(1);
  const independent = await db.couponTemplate.create({ data: { campaignId: campaign.id, merchantId: merchant.id, title: '独立赠品券', benefitText: '赠送一杯饮品。' } });
  expect((await (await redeem(await issue(independent.id))).json()).result).toBe('SUCCESS');
  const expired = await issue(independent.id, peer.id, new Date(Date.now() - 1000));
  expect((await (await redeem(expired)).json()).result).toBe('INVALID');
  const wrongMerchant = await db.merchant.create({ data: { name: '另一个合成商家' } });
  const wrongTemplate = await db.couponTemplate.create({ data: { campaignId: campaign.id, merchantId: wrongMerchant.id, title: '不可越权券', benefitText: '仅限另一商家。' } });
  expect((await (await redeem(await issue(wrongTemplate.id))).json()).result).toBe('INVALID');
  const mergedLongContent = '惠'.repeat(2000) + '\n\n' + '限'.repeat(2000);
  const longContentResponse = await context.request.post(`${api}/admin/campaigns/${campaign.id}/templates`, { data: { merchantId: merchant.id, title: '合并长文本', benefitText: mergedLongContent } });
  expect(longContentResponse.ok()).toBe(true);
  expect((await longContentResponse.json()).benefitText).toBe(mergedLongContent);

});

test('legacy rules become text while issued coupons and historical amounts survive migration', async ({ db }, info) => {
  const { readFile } = await import('node:fs/promises');
  const { randomUUID } = await import('node:crypto');
  const schema = `text_migration_${randomUUID().replaceAll('-', '')}`;
  const sql = await readFile('apps/api/prisma/migrations/20261016030000_text_coupons_and_redemption_groups/migration.sql', 'utf8');
  await db.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
    await tx.$executeRawUnsafe(`CREATE TYPE "CouponBenefitType" AS ENUM ('CUSTOM','FULL_REDUCTION','DISCOUNT','GIFT')`);
    for (const table of ['Campaign','Merchant','User','Coupon']) await tx.$executeRawUnsafe(`CREATE TABLE "${table}" (id text PRIMARY KEY)`);
    await tx.$executeRawUnsafe('CREATE TABLE "Redemption" (id text PRIMARY KEY, "faceValueSnapshot" integer NOT NULL)');
    await tx.$executeRawUnsafe('CREATE TABLE "CouponTemplate" (id text PRIMARY KEY, "campaignId" text, "merchantId" text, title text, description text, "benefitType" "CouponBenefitType", rule jsonb, "faceValue" integer)');
    for (const table of ['Campaign','Merchant','User','Coupon']) await tx.$executeRawUnsafe(`INSERT INTO "${table}" VALUES ('${table}')`);
    await tx.$executeRawUnsafe(`INSERT INTO "Redemption" VALUES ('redeemed',1500)`);
    await tx.$executeRawUnsafe(`INSERT INTO "CouponTemplate" VALUES ('t','Campaign','Merchant','原券','仅限堂食','FULL_REDUCTION','{"version":1,"tiers":[{"minSpend":5000,"benefit":{"type":"AMOUNT_OFF","amountOff":1000}},{"minSpend":10000,"benefit":{"type":"GIFT","description":"咖啡"}}]}'::jsonb,1000)`);
    await tx.$executeRawUnsafe(`INSERT INTO "CouponTemplate" VALUES ('discount','Campaign','Merchant','折扣券',NULL,'DISCOUNT','{"version":1,"tiers":[{"minSpend":5001,"benefit":{"type":"PERCENT_OFF","percentOff":20,"maxOff":1234}}]}'::jsonb,0), ('custom','Campaign','Merchant','原文字约定',NULL,'CUSTOM',NULL,0)`);
    for (const statement of sql.split(';').filter((s: string) => s.trim() && !['BEGIN','COMMIT'].includes(s.trim()))) await tx.$executeRawUnsafe(statement);
    const rows = await tx.$queryRawUnsafe('SELECT id, "benefitText", "usageNotes", "redemptionGroupId" FROM "CouponTemplate" ORDER BY id');
    expect(rows).toEqual([
      { id: 'custom', benefitText: '原文字约定', usageNotes: null, redemptionGroupId: null },
      { id: 'discount', benefitText: '消费满50.01元，减免20%，最多减免12.34元', usageNotes: null, redemptionGroupId: null },
      { id: 't', benefitText: '消费满50元，减免10元\n消费满100元，赠送咖啡', usageNotes: '仅限堂食', redemptionGroupId: null },
    ]);
    expect(await tx.$queryRawUnsafe('SELECT "faceValueSnapshot" FROM "Redemption"')).toEqual([{ faceValueSnapshot: 1500 }]);
    expect(await tx.$queryRawUnsafe('SELECT id FROM "Coupon"')).toEqual([{ id: 'Coupon' }]);
    await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  });
  await info.attach('legacy-migration', { contentType: 'application/json', body: JSON.stringify({ tierTextPreserved: true, couponsPreserved: true, historicalAmountPreserved: true }) });
});

test('merging coupon descriptions preserves all text and removes the separate column', async ({ db }, info) => {
  const { readFile } = await import('node:fs/promises');
  const { randomUUID } = await import('node:crypto');
  const schema = `merge_notes_${randomUUID().replaceAll('-', '')}`;
  const sql = await readFile('apps/api/prisma/migrations/20261016040000_merge_coupon_usage_notes/migration.sql', 'utf8');
  await db.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
    await tx.$executeRawUnsafe('CREATE TABLE "CouponTemplate" (id integer PRIMARY KEY, "benefitText" text NOT NULL, "usageNotes" text)');
    await tx.$executeRawUnsafe(`INSERT INTO "CouponTemplate" VALUES (1,'满50减5','限堂食'), (2,'八折',NULL), (3,'赠咖啡','   '), (4,'','保留旧说明')`);
    for (const statement of sql.split(';').filter((s: string) => s.trim() && !['BEGIN','COMMIT'].includes(s.trim()))) await tx.$executeRawUnsafe(statement);
    expect(await tx.$queryRawUnsafe('SELECT * FROM "CouponTemplate" ORDER BY id')).toEqual([
      { id: 1, benefitText: '满50减5\n\n限堂食' }, { id: 2, benefitText: '八折' },
      { id: 3, benefitText: '赠咖啡' }, { id: 4, benefitText: '保留旧说明' },
    ]);
    await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  });
  await info.attach('description-merge', { contentType: 'application/json', body: JSON.stringify({ contentPreserved: true, separateColumnRemoved: true, blankNotesDoNotAddLines: true }) });
});

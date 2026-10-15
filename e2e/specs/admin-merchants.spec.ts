import { createHash } from "node:crypto";
import { test, expect, api, password, visit } from "../support/fixtures";

test.use({ trace: "off", video: "off", screenshot: "off" });

test("merchant cards isolate account management and persist account status @webkit @mobile", async ({
  page,
  db,
  account,
  context,
  browser,
}, info) => {
  const source = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const admin = await db.adminOperator.create({
    data: { email: `admin-${account.email}`, passwordHash: source.passwordHash },
  });
  expect(
    (
      await context.request.post(`${api}/admin-session/login`, {
        data: { email: admin.email, password },
      })
    ).ok()
  ).toBe(true);
  const merchant = await db.merchant.create({ data: { name: `验收咖啡 ${account.id}` } });
  const empty = await db.merchant.create({ data: { name: `验收书店 ${account.id}` } });
  const operator = await db.merchantUser.create({
    data: {
      merchantId: merchant.id,
      email: `staff-${account.email}`,
      passwordHash: source.passwordHash,
      role: "STAFF",
    },
  });
  const removedConfig = await context.request.patch(`${api}/admin/merchants/${merchant.id}`, {
    data: { promotionBlocks: [] },
  });
  expect(removedConfig.status()).toBe(400);
  const listed = await (await context.request.get(`${api}/admin/merchants`)).json();
  expect(listed.items.find((item: { id: string }) => item.id === merchant.id)).not.toHaveProperty(
    "promotionBlocks"
  );
  expect(
    (
      await context.request.patch(`${api}/admin/merchants/${merchant.id}`, {
        data: { isActive: false },
      })
    ).status()
  ).toBe(400);
  expect(listed.items.find((item: { id: string }) => item.id === merchant.id)).not.toHaveProperty(
    "isActive"
  );
  const merchantSession = await browser.newContext({ extraHTTPHeaders: { "cf-connecting-ip": `2001:db8:${createHash("sha256").update(`${info.testId}:merchant`).digest("hex").slice(0, 16).match(/.{4}/g)!.join(":")}::2` } });
  expect(
    (
      await merchantSession.request.post(`${api}/merchant/auth/login`, {
        data: { email: operator.email, password },
      })
    ).ok()
  ).toBe(true);
  try {
    await visit(page, "/admin/merchants");
    const card = page.getByRole("article", { name: merchant.name, exact: true });
    await expect(card).toBeVisible();
    await expect(card.getByText("商家设置", { exact: true })).toHaveCount(0);
    await expect(card.getByText("优惠券", { exact: true })).toHaveCount(0);
    await expect(card.getByText("核销", { exact: true })).toHaveCount(0);
    await card.getByRole("button", { name: merchant.name, exact: true }).click();
    const row = card.getByRole("row").filter({ hasText: operator.email });
    await expect(card.getByText("核销后展示内容（高级设置）")).toHaveCount(0);
    await expect(row.getByText("启用中", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "停用", exact: true }).click();
    await expect(row.getByText("已停用", { exact: true })).toBeVisible();
    expect((await merchantSession.request.get(`${api}/merchant/auth/me`)).status()).toBe(401);
    expect(
      (
        await merchantSession.request.post(`${api}/merchant/redeem`, {
          data: { code: "ABC234", totp: "123456" },
        })
      ).status()
    ).toBe(401);
    expect(
      (
        await merchantSession.request.post(`${api}/merchant/auth/login`, {
          data: { email: operator.email, password },
        })
      ).status()
    ).toBe(401);
    expect((await db.merchantUser.findUniqueOrThrow({ where: { id: operator.id } })).isActive).toBe(
      false
    );
    await expect(card.getByText("1 个账号 · 已停用", { exact: true })).toBeVisible();
    await card.getByRole("button", { name: merchant.name, exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(row).toHaveCount(0);
    await page.keyboard.press("Space");
    await expect(row).toBeVisible();
    await page.reload();
    await card.getByRole("button", { name: merchant.name, exact: true }).click();
    await expect(row.getByText("已停用", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "启用", exact: true }).click();
    await expect(row.getByText("启用中", { exact: true })).toBeVisible();
    expect(
      (
        await merchantSession.request.post(`${api}/merchant/auth/login`, {
          data: { email: operator.email, password },
        })
      ).ok()
    ).toBe(true);
    await card.getByRole("button", { name: "添加账号", exact: true }).click();
    await expect(card.getByLabel("账号邮箱")).toBeVisible();
    await expect(card.getByLabel("显示名")).toHaveCount(0);
    await expect(card.getByRole("combobox")).toHaveCount(0);
    await expect(card.getByRole("columnheader", { name: "角色" })).toHaveCount(0);
    await card.getByLabel("账号邮箱").fill(`new-${account.email}`);
    await card.getByLabel("初始密码", { exact: true }).fill(password);
    await card.getByRole("button", { name: "新增账号", exact: true }).click();
    await expect(card.getByRole("row").filter({ hasText: `new-${account.email}` })).toBeVisible();
    await expect(card.getByText("2 个账号 · 全部启用", { exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath("merchant-accounts.png"), fullPage: true });
    const emptyCard = page.getByRole("article", { name: empty.name, exact: true });
    await emptyCard.getByRole("button", { name: empty.name, exact: true }).click();
    await expect(emptyCard.getByText("暂无核销账号。")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    ).toBe(true);
    const cards = await page.getByRole("article").evaluateAll((elements) =>
      elements.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      })
    );
    for (let i = 1; i < cards.length; i++)
      expect(cards[i].top - cards[i - 1].bottom).toBeGreaterThanOrEqual(12);
    await page.screenshot({ path: info.outputPath("merchant-cards.png"), fullPage: true });
  } finally {
    await merchantSession.close();
  }
});

test('retiring merchant status preserves disabled accounts and templates during migration', async ({ db }, info) => {
  const { readFile } = await import('node:fs/promises');
  const { randomUUID } = await import('node:crypto');
  const schema = `merchant_migration_${randomUUID().replaceAll('-', '')}`;
  const migration = await readFile('apps/api/prisma/migrations/20261016010000_retire_merchant_status/migration.sql', 'utf8');
  await db.$transaction(async (tx: any) => {
    await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
    await tx.$executeRawUnsafe('CREATE TABLE "Merchant" (id text PRIMARY KEY, "isActive" boolean NOT NULL)');
    await tx.$executeRawUnsafe('CREATE INDEX "Merchant_isActive_idx" ON "Merchant" ("isActive")');
    for (const table of ['MerchantUser', 'CouponTemplate']) {
      await tx.$executeRawUnsafe(`CREATE TABLE "${table}" (id text PRIMARY KEY, "merchantId" text NOT NULL, "isActive" boolean NOT NULL, "updatedAt" timestamptz)`);
      await tx.$executeRawUnsafe(`INSERT INTO "${table}" (id, "merchantId", "isActive") VALUES ('formerly-blocked', 'disabled', true), ('already-disabled', 'disabled', false), ('still-enabled', 'enabled', true)`);
    }
    await tx.$executeRawUnsafe(`INSERT INTO "Merchant" VALUES ('disabled', false), ('enabled', true)`);
    for (const statement of migration.split(';').filter(sql => sql.trim())) await tx.$executeRawUnsafe(statement);
    for (const table of ['MerchantUser', 'CouponTemplate']) {
      const rows = await tx.$queryRawUnsafe(`SELECT id, "isActive" FROM "${table}" ORDER BY id`);
      expect(rows).toEqual([{ id: 'already-disabled', isActive: false }, { id: 'formerly-blocked', isActive: false }, { id: 'still-enabled', isActive: true }]);
    }
    const columns = await tx.$queryRawUnsafe(`SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'Merchant' AND column_name = 'isActive'`, schema);
    expect(columns).toHaveLength(0);
    await tx.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  });
  await info.attach('merchant-status-migration', { contentType: 'application/json', body: JSON.stringify({ disabledAccountsPreserved: true, disabledTemplatesPreserved: true, enabledAccountsPreserved: true, merchantStatusRemoved: true }) });
});

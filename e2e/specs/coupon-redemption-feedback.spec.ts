import { createHash } from "node:crypto";
import { COUPON_CODE_LENGTH, generateHumanCode, generateTotpSecret, generateTotpToken } from "@lilink/shared";
import { test, expect, api, password, visit } from "../support/fixtures";

test.use({ trace: "off", video: "off", screenshot: "off" });

test("redemption keeps confirmation and history without a promotion page @webkit @mobile", async ({
  page,
  browser,
  context,
  db,
  account,
  signedIn,
}, info) => {
  void signedIn;
  const source = await db.user.findUniqueOrThrow({ where: { id: account.id } });
  const merchant = await db.merchant.create({ data: { name: "合成核销商家" } });
  const operator = await db.merchantUser.create({
    data: {
      merchantId: merchant.id,
      email: `redeem-${account.email}`,
      passwordHash: source.passwordHash,
    },
  });
  const campaign = await db.campaign.create({
    data: { name: "合成核销活动", slug: `feedback-${account.id}` },
  });
  const template = await db.couponTemplate.create({
    data: {
      merchantId: merchant.id,
      campaignId: campaign.id,
      title: "合成核销验收券",
      benefitText: "合成优惠，由店员现场确认。",
    },
  });
  const coupon = await db.coupon.create({
    data: {
      userId: account.id,
      templateId: template.id,
      code: generateHumanCode({ length: COUPON_CODE_LENGTH }),
      totpSecret: generateTotpSecret(),
    },
  });
  const removedColumns = await db.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Merchant' AND column_name = 'promotionBlocks'`
  );
  expect(removedColumns).toHaveLength(0);
  await visit(page, "/dashboard/coupons");
  await page.getByRole("button", { name: "查看核销码", exact: true }).click();
  await expect(page.getByRole("dialog").getByText("请向店员出示此核销码")).toBeVisible();
  const merchantContext = await browser.newContext({ extraHTTPHeaders: { "cf-connecting-ip": `2001:db8:${createHash("sha256").update(`${info.testId}:merchant`).digest("hex").slice(0, 16).match(/.{4}/g)!.join(":")}::2` } });
  try {
    expect(
      (
        await merchantContext.request.post(`${api}/merchant/auth/login`, {
          data: { email: operator.email, password },
        })
      ).ok()
    ).toBe(true);
    const redeemed = await merchantContext.request.post(`${api}/merchant/redeem`, {
      data: { code: coupon.code, totp: generateTotpToken(coupon.totpSecret) },
    });
    expect((await redeemed.json()).result).toBe("SUCCESS");
    const status = await (
      await context.request.get(`${api}/me/coupons/${coupon.id}/status`)
    ).json();
    expect(status.status).toBe("REDEEMED");
    expect(status).not.toHaveProperty("merchantPromotion");
    await expect(
      page.getByRole("dialog").getByText("优惠券已核销。", { exact: true })
    ).toBeVisible();
    await expect(page.getByRole("dialog").getByText("核销成功", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("dialog").getByRole("img")).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("redemption-feedback.png"), fullPage: true });
    await page.getByRole("dialog").getByRole("button", { name: "完成", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page
        .getByRole("region", { name: "历史记录" })
        .getByRole("article", { name: template.title, exact: true })
    ).toBeVisible();
    expect((await db.coupon.findUniqueOrThrow({ where: { id: coupon.id } })).status).toBe(
      "REDEEMED"
    );
  } finally {
    await merchantContext.close();
  }
});

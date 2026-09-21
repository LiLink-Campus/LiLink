import { COUPON_TOTP } from "@lilink/shared";
import type { Decorator } from "@storybook/nextjs-vite";
import { http, HttpResponse } from "msw";
import { expect, waitFor, within } from "storybook/test";
import { PublicChrome } from "@/app/public-chrome";
import { AppShell } from "@/app/dashboard/_components/AppShell";
import AdminLayoutShell from "@/app/admin/admin-layout-shell";
import { now, schools, contacts, coupon, merchant, prepare } from "./site-fixtures";
import { matchStoryUser, matchDashboardFixtures } from "@/app/dashboard/match/match.fixtures";
import { referralFixtures } from "@/app/dashboard/referrals/referrals.fixtures";

export const api = "http://localhost:4000/v1";
export const publicShell: Decorator = (Story, context) =>
  context.parameters.publicChrome === false ? (
    <Story />
  ) : (
    <PublicChrome>
      <Story />
    </PublicChrome>
  );
export const dashboardShell: Decorator = (Story) => (
  <AppShell>
    <Story />
  </AppShell>
);
export const adminIdentity = {
  id: "admin-story",
  email: "admin@example.test",
  displayName: "演示管理员",
};
export const adminShell: Decorator = (Story, context) =>
  context.parameters.adminChrome === false ? (
    <Story />
  ) : (
    <AdminLayoutShell initialAdmin={adminIdentity} authChecked>
      <Story />
    </AdminLayoutShell>
  );
export const route = (pathname: string) => ({
  nextjs: { appDirectory: true, navigation: { pathname } },
  fixedNow: now,
});
export const json = (path: string, data: Parameters<typeof HttpResponse.json>[0]) =>
  http.get(`${api}${path}`, () => HttpResponse.json(data));
export const failure = (path: string, method: "get" | "post" | "put" = "get") =>
  http[method](`${api}${path}`, () =>
    HttpResponse.json({ message: "模拟服务暂时不可用，请重试。" }, { status: 503 })
  );
export const guest = http.get(`${api}/auth/me`, () =>
  HttpResponse.json({ message: "未登录" }, { status: 401 })
);
export const schoolHandler = http.get("*/api/public/schools", () => HttpResponse.json(schools));
export const readState = {
  target: "coupons",
  version: "story-v1",
  availableCount: 1,
  unreadAvailableCount: 0,
  read: true,
  readAt: now,
  href: "/dashboard/coupons",
};
export const siteHandlers = [
  json("/me/vip", { active: false, activatedAt: null, expiresAt: null, durationDays: 30, priceYuan: "29.90", advancedFiltersAvailable: true }),
  schoolHandler,
  http.get(/\/api\/devlog\/latest$/, () => HttpResponse.json({ latestPublishedAt: null })),
  json("/me/dashboard", matchDashboardFixtures.waitingNoResult),
  json("/me/contact-preferences", contacts),
  json("/me/referral", referralFixtures.eduWithFullQuota),
  json("/me/coupons", { items: [coupon] }),
  json("/me/coupons/read-state", readState),
  http.post(`${api}/me/coupons/read-state`, () => HttpResponse.json(readState)),
  json("/me/coupons/:id/redeem-secret", {
    code: coupon.code,
    secret: "JBSWY3DPEHPK3PXP",
    period: COUPON_TOTP.period,
    digits: COUPON_TOTP.digits,
  }),
  json("/me/coupons/:id/status", { status: "ISSUED" }),
  http.post(`${api}/me/match-estimate`, () =>
    HttpResponse.json({ available: false, reason: "NO_CURRENT_CYCLE" })
  ),
  http.put(`${api}/me/contact-preferences`, async ({ request }) => {
    const payload = await request.json() as { revision: number };
    return HttpResponse.json({ email: matchStoryUser.email, ...payload, revision: payload.revision + 1 });
  }),
  json("/merchant/auth/me", { ok: true, merchantUser: merchant }),
  http.post(`${api}/merchant/redeem/prepare`, () => HttpResponse.json(prepare)),
  http.post(`${api}/merchant/redeem`, () =>
    HttpResponse.json({
      result: "SUCCESS",
      coupon: prepare.coupon,
      applied: { orderAmount: 6000, discountAmount: 1000, gift: null },
    })
  ),
];
export function visible(text: string | RegExp) {
  return async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const matches = await within(canvasElement).findAllByText(text);
    await waitFor(() => expect(matches.find((element) => element.checkVisibility())).toBeVisible());
  };
}

import { redirect } from "next/navigation";
import { ensureDashboardSession } from "../_lib/bootstrap";
import { fetchUserApiServer, ServerApiError } from "../../../lib/server-api";
import type { AuthMePayload, CouponOverview } from "../../../lib/api";
import { CouponsClient } from "./coupons-client";

export default async function DashboardCouponsPage() {
  await ensureDashboardSession();
  const [user, coupons] = await Promise.allSettled([
    fetchUserApiServer<AuthMePayload>("/auth/me"),
    fetchUserApiServer<CouponOverview>("/me/coupons/overview"),
  ]);
  for (const result of [user, coupons]) {
    if (result.status === "rejected" && result.reason instanceof ServerApiError && result.reason.status === 401) {
      redirect("/login");
    }
  }
  if (user.status === "rejected") throw user.reason;
  return <CouponsClient
    initialUser={user.value}
    initialOverview={coupons.status === "fulfilled" ? coupons.value : null}
    initialError={coupons.status === "rejected" ? "优惠券暂时无法加载，请重试。" : null}
  />;
}

import { ensureDashboardSession } from "../_lib/bootstrap";
import { fetchUserApiServer } from "../../../lib/server-api";
import type { MyCoupon } from "../../../lib/api";
import { CouponsClient } from "./coupons-client";

export default async function DashboardCouponsPage() {
  await ensureDashboardSession();

  // Fetch on the server so the page renders with data instead of a client
  // fetch-on-mount round-trip. On failure we fall back to null and let the
  // client fetch + surface its own inline error.
  let initialCoupons: MyCoupon[] | null = null;
  try {
    const result = await fetchUserApiServer<{ items: MyCoupon[] }>(
      "/me/coupons",
    );
    initialCoupons = result.items;
  } catch {
    initialCoupons = null;
  }

  return <CouponsClient initialCoupons={initialCoupons} />;
}

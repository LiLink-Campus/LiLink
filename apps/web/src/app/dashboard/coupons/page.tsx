import { ensureDashboardSession } from "../_lib/bootstrap";
import { CouponsClient } from "./coupons-client";

export default async function DashboardCouponsPage() {
  await ensureDashboardSession();
  return <CouponsClient />;
}

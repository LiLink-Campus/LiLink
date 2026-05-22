import { ensureDashboardSession } from "../_lib/bootstrap";
import { ReferralsClient } from "./referrals-client";

export default async function DashboardReferralsPage() {
  await ensureDashboardSession();
  return <ReferralsClient />;
}

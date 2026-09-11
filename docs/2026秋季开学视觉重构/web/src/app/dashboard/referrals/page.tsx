import { ensureDashboardSession } from "../_lib/bootstrap";
import { fetchUserApiServer } from "../../../lib/server-api";
import type { MyReferralOverview } from "../../../lib/api";
import { ReferralsClient } from "./referrals-client";

export default async function DashboardReferralsPage() {
  await ensureDashboardSession();

  // Fetch on the server so the page renders with data instead of a client
  // fetch-on-mount round-trip. On failure we fall back to null and let the
  // client fetch + surface its own inline error.
  let initialReferral: MyReferralOverview | null = null;
  try {
    initialReferral = await fetchUserApiServer<MyReferralOverview>(
      "/me/referral",
    );
  } catch {
    initialReferral = null;
  }

  return <ReferralsClient initialReferral={initialReferral} />;
}

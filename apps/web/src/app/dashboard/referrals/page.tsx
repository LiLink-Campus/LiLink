import { generateDynamicSentryMetadata } from "../../../lib/sentry-request-metadata";

import { redirect } from "next/navigation";
import { ensureDashboardSession } from "../_lib/bootstrap";
import { fetchUserApiServer, ServerApiError } from "../../../lib/server-api";
import type { AuthMePayload, MyReferralOverview } from "../../../lib/api";
import { DashboardSessionSeed } from "../_components/DashboardSessionSeed";
import { ReferralsClient } from "./referrals-client";

export const generateMetadata = generateDynamicSentryMetadata;

export default async function DashboardReferralsPage() {
  await ensureDashboardSession();

  const [user, referral] = await Promise.allSettled([
    fetchUserApiServer<AuthMePayload>("/auth/me"),
    fetchUserApiServer<MyReferralOverview>("/me/referral"),
  ]);
  for (const result of [user, referral]) {
    if (result.status === "rejected" && result.reason instanceof ServerApiError && result.reason.status === 401) {
      redirect("/login");
    }
  }
  if (user.status === "rejected") throw user.reason;

  return <>
    <DashboardSessionSeed initialUser={user.value} />
    <ReferralsClient initialReferral={referral.status === "fulfilled" ? referral.value : null} />
  </>;
}

import type { VipStatus } from "@lilink/shared";
import { generateDynamicSentryMetadata } from "../../../lib/sentry-request-metadata";

import { fetchUserApiServer, ServerApiError } from "../../../lib/server-api";
import type { AuthMePayload } from "../../../lib/api";
import { ensureDashboardSession } from "../_lib/bootstrap";
import { DashboardSessionSeed } from "../_components/DashboardSessionSeed";
import { VipClient } from "./vip-client";
import { redirect } from "next/navigation";

export const generateMetadata = generateDynamicSentryMetadata;

export default async function VipPage() {
  await ensureDashboardSession();
  const [user, status] = await Promise.all([
    fetchUserApiServer<AuthMePayload>("/auth/me").catch(error => {
      if (error instanceof ServerApiError && error.status === 401) return null;
      throw error;
    }),
    fetchUserApiServer<VipStatus>("/me/vip").catch(() => null),
  ]);
  if (!user) redirect("/login");
  return <><DashboardSessionSeed initialUser={user} /><VipClient initialStatus={status} /></>;
}

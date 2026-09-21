import { fetchUserApiServer, ServerApiError } from "../../../lib/server-api";
import { ensureDashboardSession } from "../_lib/bootstrap";
import { VipClient, type VipStatus } from "./vip-client";
import { redirect } from "next/navigation";

export default async function VipPage() {
  await ensureDashboardSession();
  const [user, status] = await Promise.all([
    fetchUserApiServer("/auth/me").catch(error => {
      if (error instanceof ServerApiError && error.status === 401) return null;
      throw error;
    }),
    fetchUserApiServer<VipStatus>("/me/vip").catch(() => null),
  ]);
  if (!user) redirect("/login");
  return <VipClient initialStatus={status} />;
}

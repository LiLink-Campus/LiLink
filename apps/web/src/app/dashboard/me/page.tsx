import { redirect } from "next/navigation";
import type { AuthMePayload } from "../../../lib/api";
import { fetchUserApiServer, ServerApiError } from "../../../lib/server-api";
import { ensureDashboardSession } from "../_lib/bootstrap";
import type { VipStatus } from "../vip/vip-client";
import { UserCenter } from "./user-center";

export default async function DashboardMePage() {
  await ensureDashboardSession();
  const [user, status] = await Promise.all([
    fetchUserApiServer<AuthMePayload>("/auth/me").catch(error => {
      if (error instanceof ServerApiError && error.status === 401) return null;
      throw error;
    }),
    fetchUserApiServer<VipStatus>("/me/vip").catch(() => null),
  ]);
  if (!user) redirect("/login");
  return <UserCenter initialUser={user} initialStatus={status} />;
}

import { redirect } from "next/navigation";
import type { AuthMePayload } from "../../../lib/api";
import { fetchUserApiServer } from "../../../lib/server-api";
import { ensureDashboardSession } from "../_lib/bootstrap";
import type { VipStatus } from "../vip/vip-client";
import { UserCenter } from "./user-center";

export default async function DashboardMePage() {
  await ensureDashboardSession();
  const user = await fetchUserApiServer<AuthMePayload>("/auth/me").catch(() => null);
  if (!user) redirect("/login");
  const status = await fetchUserApiServer<VipStatus>("/me/vip").catch(() => null);
  return <UserCenter initialUser={user} initialStatus={status} />;
}

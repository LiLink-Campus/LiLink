import { fetchUserApiServer } from "../../../lib/server-api";
import { ensureDashboardSession } from "../_lib/bootstrap";
import { VipClient, type VipStatus } from "./vip-client";
import { redirect } from "next/navigation";

export default async function VipPage() {
  await ensureDashboardSession();
  try { await fetchUserApiServer("/auth/me"); }
  catch { redirect("/login"); }
  const status = await fetchUserApiServer<VipStatus>("/me/vip").catch(() => null);
  return <VipClient initialStatus={status} />;
}

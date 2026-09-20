import { fetchAdminApiServer, hasAdminSessionCookie } from "../../lib/server-api";
import AdminOverviewPage from "./admin-overview-client";
import type { AdminDashboardData } from "./types";

async function getInitialOverviewData() {
  if (!(await hasAdminSessionCookie())) {
    return null;
  }

  try {
    return await fetchAdminApiServer<AdminDashboardData>("/admin/dashboard");
  } catch {
    return null;
  }
}

export default async function AdminOverviewServerPage() {
  const dashboard = await getInitialOverviewData();

  return <AdminOverviewPage initialDashboard={dashboard} />;
}

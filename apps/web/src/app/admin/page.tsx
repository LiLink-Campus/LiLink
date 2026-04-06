import {
  fetchAdminApiServer,
  hasAdminSessionCookie,
} from "../../lib/server-api";
import AdminOverviewPage from "./admin-overview-client";
import type { AdminDashboardData } from "./types";

type SystemSettings = Record<string, string>;

async function getInitialOverviewData() {
  if (!(await hasAdminSessionCookie())) {
    return {
      dashboard: null,
      settings: null,
    };
  }

  try {
    const [dashboard, settings] = await Promise.all([
      fetchAdminApiServer<AdminDashboardData>("/admin/dashboard"),
      fetchAdminApiServer<SystemSettings>("/admin/settings"),
    ]);

    return {
      dashboard,
      settings,
    };
  } catch {
    return {
      dashboard: null,
      settings: null,
    };
  }
}

export default async function AdminOverviewServerPage() {
  const { dashboard, settings } = await getInitialOverviewData();

  return (
    <AdminOverviewPage
      initialDashboard={dashboard}
      initialSettings={settings}
    />
  );
}

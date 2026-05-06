import { loadDashboardCore } from "../_lib/bootstrap";
import { MeClient } from "./me-client";

export default async function DashboardMePage() {
  const { user, dashboard } = await loadDashboardCore();
  return <MeClient initialUser={user} initialDashboard={dashboard} />;
}

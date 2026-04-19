import { loadDashboardCore } from "../_lib/bootstrap";
import "../../protected.css";
import "../dashboard.css";
import { HistoryClient } from "./history-client";

export default async function DashboardHistoryPage() {
  const { user, dashboard } = await loadDashboardCore();
  return <HistoryClient initialUser={user} initialDashboard={dashboard} />;
}

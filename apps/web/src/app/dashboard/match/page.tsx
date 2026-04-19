import { loadDashboardCore } from "../_lib/bootstrap";
import "../../protected.css";
import "../dashboard.css";
import { MatchClient } from "./match-client";

export default async function DashboardMatchPage() {
  const { user, dashboard } = await loadDashboardCore();
  return <MatchClient initialUser={user} initialDashboard={dashboard} />;
}

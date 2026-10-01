import { loadDashboardCore } from "../../_lib/bootstrap";
import { MatchHistoryClient } from "./match-history-client";

export default async function MatchHistoryPage() {
  const { user, dashboard } = await loadDashboardCore();
  return <MatchHistoryClient initialUser={user} initialDashboard={dashboard} />;
}

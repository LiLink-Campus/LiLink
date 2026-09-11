import { loadDashboardCore } from "../_lib/bootstrap";
import { MatchClient } from "./match-client";

export default async function DashboardMatchPage() {
  // Freeze the render-time clock so participation lock state stays
  // hydration-stable across the deadline (see issue #75).
  const initialNowMs = Date.now();
  const { user, dashboard } = await loadDashboardCore();
  return (
    <MatchClient
      initialNowMs={initialNowMs}
      initialUser={user}
      initialDashboard={dashboard}
    />
  );
}

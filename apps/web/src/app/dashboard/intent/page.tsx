import { loadDashboardCore } from "../_lib/bootstrap";
import "../../protected.css";
import "../dashboard.css";
import { IntentClient } from "./intent-client";

export default async function DashboardIntentPage() {
  const { dashboard } = await loadDashboardCore();
  return <IntentClient initialDashboard={dashboard} />;
}

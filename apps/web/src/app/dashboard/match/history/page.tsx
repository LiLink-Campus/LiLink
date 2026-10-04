import { generateDynamicSentryMetadata } from "../../../../lib/sentry-request-metadata";

import { loadDashboardCore } from "../../_lib/bootstrap";
import { MatchHistoryClient } from "./match-history-client";

export const generateMetadata = generateDynamicSentryMetadata;

export default async function MatchHistoryPage() {
  const { user, dashboard } = await loadDashboardCore();
  return <MatchHistoryClient initialUser={user} initialDashboard={dashboard} />;
}
